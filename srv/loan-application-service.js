const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {
    const { Documents, CreditChecks, Exceptions, Rules, LoanApplications, LoanProducts, Officers, Applicants, ApprovalSteps, AuditLogs } = this.entities;
    // --- Helpers ---
    async function recordApprovalStep(tx, appID, approver, decision, comments) {
        await tx.run(INSERT.into(ApprovalSteps).entries({
            application_ID: appID, approver, level: 1, decision,
            decidedAt: new Date().toISOString(), comments
        }));
    }

    async function recordAudit(tx, appID, actor, before, after, reason) {
        await tx.run(INSERT.into(AuditLogs).entries({
            application_ID: appID, eventType: 'STATUS_CHANGE', actor,
            beforeValue: before, afterValue: after, reason
        }));
    }

    // --- runValidation ---
    this.on('runValidation', 'LoanApplications', async (req) => {
        let appID = req.params[0];
        if (typeof appID === 'object' && appID !== null) appID = appID.ID;

        const tx = cds.transaction(req);
        const documents = await tx.run(SELECT.from(Documents).where({ application_ID: appID }));
        const creditCheck = await tx.run(SELECT.one.from(CreditChecks).where({ application_ID: appID }));
        const rules = await tx.run(SELECT.from(Rules));
        const ruleByCode = code => rules.find(r => r.code === code);

        await tx.run(DELETE.from(Exceptions).where({ application_ID: appID, status: 'OPEN' }));

        const newExceptions = [];

        const REQUIRED_DOC_TYPES = ['ID_PROOF', 'INCOME_PROOF'];
        const missingTypes = REQUIRED_DOC_TYPES.filter(
            type => !documents.some(d => d.docType === type && d.status !== 'EXPIRED')
        );
        const expiredDocs = documents.filter(d => d.status === 'EXPIRED');

        if (missingTypes.length) {
            newExceptions.push({
                application_ID: appID,
                rule_ID: ruleByCode('L6-DOCUMENT-MISSING')?.ID,
                reasonCode: 'DOC_MISSING', severity: 'Critical', status: 'OPEN',
                description: `Required document(s) missing: ${missingTypes.join(', ')}`,
                suggestedAction: 'Request missing documents from applicant'
            });
        }
        expiredDocs.forEach(doc => {
            newExceptions.push({
                application_ID: appID,
                rule_ID: ruleByCode('L6-DOCUMENT-MISSING')?.ID,
                reasonCode: 'DOC_EXPIRED', severity: 'Critical', status: 'OPEN',
                description: `${doc.docType} expired on ${doc.expiryDate}`,
                suggestedAction: 'Request updated document from applicant'
            });
        });

        if (creditCheck?.status === 'STALE') {
            newExceptions.push({
                application_ID: appID,
                rule_ID: ruleByCode('L7-CREDIT-STALE')?.ID,
                reasonCode: 'CREDIT_STALE', severity: 'Major', status: 'OPEN',
                description: 'Credit check is older than the validity window',
                suggestedAction: 'Re-run credit assessment'
            });
        }

        if (newExceptions.length) await tx.run(INSERT.into(Exceptions).entries(newExceptions));
        await tx.run(UPDATE(LoanApplications, appID).with({
            status: newExceptions.length ? 'EXCEPTION' : 'READY_FOR_REVIEW'
        }));

        return true;



    });

    // --- approve ---
    this.on('approve', 'LoanApplications', async (req) => {
        let appID = req.params[0];
        if (typeof appID === 'object' && appID !== null) appID = appID.ID;

        if (!req.user.is('Approver') && !req.user.is('Admin')) {
            req.error(403, 'Only an Approver or Admin may approve applications.');
            return false;
        }

        const tx = cds.transaction(req);
        const app = await tx.run(SELECT.one.from(LoanApplications, appID));

        if (app.status !== 'READY_FOR_REVIEW') {
            req.error(400, `Cannot approve from status ${app.status}. Application must be READY_FOR_REVIEW.`);
            return false;
        }
        const approver = req.user.id;
        const comments = req.data.comments || '';
        await recordApprovalStep(tx, appID, approver, 'APPROVED', comments);
        await tx.run(UPDATE(LoanApplications, appID).with({ status: 'APPROVED' }));
        await recordAudit(tx, appID, approver, app.status, 'APPROVED', comments || 'Approved by officer');
        return true;
    });

    this.on('reject', 'LoanApplications', async (req) => {
        let appID = req.params[0];
        if (typeof appID === 'object' && appID !== null) appID = appID.ID;

        if (!req.user.is('Approver') && !req.user.is('Admin') && !req.user.is('Underwriter')) {
            req.error(403, 'Only an Underwriter, Approver, or Admin may reject applications.');
            return false;
        }

        const tx = cds.transaction(req);
        const app = await tx.run(SELECT.one.from(LoanApplications, appID));

        if (!['READY_FOR_REVIEW', 'EXCEPTION', 'UNDERWRITING'].includes(app.status)) {
            req.error(400, `Cannot reject from status ${app.status}.`);
            return false;
        }
        const approver = req.user.id;
        const comments = req.data.comments || '';
        await recordApprovalStep(tx, appID, approver, 'REJECTED', comments);
        await tx.run(UPDATE(LoanApplications, appID).with({ status: 'REJECTED' }));
        await recordAudit(tx, appID, approver, app.status, 'REJECTED', comments || 'Rejected by officer');
        return true;
    });

    this.on('escalate', 'LoanApplications', async (req) => {
        let appID = req.params[0];
        if (typeof appID === 'object' && appID !== null) appID = appID.ID;

        if (req.user.is('CreditAnalyst')) {
            req.error(403, 'Credit Analysts may not escalate directly — route through an Officer or Underwriter.');
            return false;
        }

        const tx = cds.transaction(req);
        const app = await tx.run(SELECT.one.from(LoanApplications, appID));

        if (['APPROVED', 'REJECTED', 'CLOSED'].includes(app.status)) {
            req.error(400, `Cannot escalate a ${app.status} application.`);
            return false;
        }
        const approver = req.user.id;
        const comments = req.data.comments || '';
        await recordApprovalStep(tx, appID, approver, 'ESCALATED', comments);
        await tx.run(UPDATE(LoanApplications, appID).with({ status: 'ESCALATED' }));
        await recordAudit(tx, appID, approver, app.status, 'ESCALATED', comments || 'Escalated for review');
        return true;
    });


    // --- READ handler: priority scoring ---
    this.on('READ', 'LoanApplications', async (req, next) => {
        const results = await next();
        const rows = Array.isArray(results) ? results : (results ? [results] : []);
        if (!rows.length) return results;

        const tx = cds.transaction(req);
        const appIDs = rows.map(r => r.ID);

        const risks = await tx.run(SELECT.from('RiskAssessments').where({ application_ID: { in: appIDs } }));
        const exceptions = await tx.run(SELECT.from('Exceptions').where({ application_ID: { in: appIDs }, status: 'OPEN' }));
        const products = await tx.run(SELECT.from('LoanProducts'));
        const slas = await tx.run(SELECT.from('SLAs').where({ application_ID: { in: appIDs } }));

        const riskByAppId = Object.fromEntries(risks.map(r => [r.application_ID, r]));
        const productById = Object.fromEntries(products.map(p => [p.ID, p]));
        const slaByAppId = Object.fromEntries(slas.map(s => [s.application_ID, s]));
        const exceptionsByAppId = {};
        for (const ex of exceptions) (exceptionsByAppId[ex.application_ID] ||= []).push(ex);

        const RISK_SCORE = { LOW: 10, MEDIUM: 25, HIGH: 40, CRITICAL: 55 };
        const EXCEPTION_SEVERITY_SCORE = { Minor: 5, Major: 15, Critical: 30 };
        const SLA_CRITICALITY = { BREACHED: 1, AT_RISK: 2, NORMAL: 3, NO_SLA: 0 };
        const now = new Date();

        for (const row of rows) {
            const risk = riskByAppId[row.ID];
            const riskScore = risk ? (RISK_SCORE[risk.riskBand] ?? 0) : 0;

            const exList = exceptionsByAppId[row.ID] || [];
            const exceptionScore = exList.reduce((max, ex) => Math.max(max, EXCEPTION_SEVERITY_SCORE[ex.severity] ?? 0), 0);

            let ageScore = 0;
            if (row.submittedAt) {
                const ageDays = (now - new Date(row.submittedAt)) / (1000 * 60 * 60 * 24);
                if (ageDays > 10) ageScore = 20;
                else if (ageDays > 5) ageScore = 10;
                else if (ageDays > 2) ageScore = 5;
            }

            let businessImpactScore = 5;
            const product = productById[row.product_ID];
            if (product) {
                const ratio = parseFloat(row.requestedAmount) / parseFloat(product.maxAmount);
                if (ratio > 0.75) businessImpactScore = 20;
                else if (ratio > 0.4) businessImpactScore = 10;
            }

            let slaScore = 0;
            let slaStatusLabel = 'NO_SLA';
            let slaDueAt = null;
            const sla = slaByAppId[row.ID];
            if (sla) {
                slaDueAt = sla.dueAt;
                const hoursRemaining = (new Date(sla.dueAt) - now) / (1000 * 60 * 60);
                if (hoursRemaining <= 0) {
                    slaScore = 50;
                    slaStatusLabel = 'BREACHED';
                } else if (hoursRemaining <= 24) {
                    slaScore = 20;
                    slaStatusLabel = 'AT_RISK';
                } else if (hoursRemaining <= 72) {
                    slaScore = 10;
                    slaStatusLabel = 'AT_RISK';
                } else {
                    slaStatusLabel = 'NORMAL';
                }
            }

            row.priorityScore = riskScore + exceptionScore + ageScore + businessImpactScore + slaScore;
            row.slaDueAt = slaDueAt;
            row.slaStatus = slaStatusLabel;
            row.slaStatusCriticality = SLA_CRITICALITY[slaStatusLabel];
        }

        return results;
    });

    this.on('getDashboardKPIs', async (req) => {
        const tx = cds.transaction(req);
        const allApps = await tx.run(SELECT.from(LoanApplications));
        const allSlas = await tx.run(SELECT.from('SLAs'));
        const allExceptions = await tx.run(SELECT.from(Exceptions));
        const allRisks = await tx.run(SELECT.from('RiskAssessments'));
        const allApprovalSteps = await tx.run(SELECT.from(ApprovalSteps));
        const allOfficers = await tx.run(SELECT.from(Officers));
        const allApplicants = await tx.run(SELECT.from(Applicants));
        const allRules = await tx.run(SELECT.from(Rules));

        const RISK_SCORE = { LOW: 10, MEDIUM: 25, HIGH: 40, CRITICAL: 55 };
        const EXCEPTION_SEVERITY_SCORE = { Minor: 5, Major: 15, Critical: 30 };
        const OPEN_STATUSES = ['DRAFT', 'SUBMITTED', 'VALIDATING', 'EXCEPTION', 'READY_FOR_REVIEW', 'UNDERWRITING'];
        const now = new Date();

        function computeCore(apps, slas, exceptions, risks, approvalSteps, asOf) {
            const byStatus = {};
            apps.forEach(a => byStatus[a.status] = (byStatus[a.status] || 0) + 1);

            let breached = 0;
            slas.forEach(s => { if (new Date(s.dueAt) < asOf) breached++; });
            const slaBreachRate = slas.length ? Math.round((breached / slas.length) * 1000) / 10 : 0;

            const bySeverity = {};
            exceptions.forEach(e => bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1);

            const byRiskBand = {};
            risks.forEach(r => byRiskBand[r.riskBand] = (byRiskBand[r.riskBand] || 0) + 1);

            let agedCount = 0;
            apps.forEach(a => {
                if (OPEN_STATUSES.includes(a.status) && a.submittedAt) {
                    const ageDays = (asOf - new Date(a.submittedAt)) / (1000 * 60 * 60 * 24);
                    if (ageDays > 5) agedCount++;
                }
            });

            const appById = Object.fromEntries(apps.map(a => [a.ID, a]));
            let totalCycleDays = 0, cycleCount = 0;
            approvalSteps.forEach(step => {
                const app = appById[step.application_ID];
                if (app && app.submittedAt && step.decidedAt) {
                    const days = (new Date(step.decidedAt) - new Date(app.submittedAt)) / (1000 * 60 * 60 * 24);
                    totalCycleDays += days;
                    cycleCount++;
                }
            });
            const avgCycleDays = cycleCount ? Math.round((totalCycleDays / cycleCount) * 10) / 10 : null;

            const riskByAppId = Object.fromEntries(risks.map(r => [r.application_ID, r]));
            const slaByAppId = Object.fromEntries(slas.map(s => [s.application_ID, s]));
            const exceptionsByAppId = {};
            for (const ex of exceptions) (exceptionsByAppId[ex.application_ID] ||= []).push(ex);

            let totalPriority = 0;
            apps.forEach(app => {
                const risk = riskByAppId[app.ID];
                const riskScore = risk ? (RISK_SCORE[risk.riskBand] ?? 0) : 0;
                const exList = exceptionsByAppId[app.ID] || [];
                const exceptionScore = exList.reduce((max, ex) => Math.max(max, EXCEPTION_SEVERITY_SCORE[ex.severity] ?? 0), 0);
                let ageScore = 0;
                if (app.submittedAt) {
                    const ageDays = (asOf - new Date(app.submittedAt)) / (1000 * 60 * 60 * 24);
                    if (ageDays > 10) ageScore = 20;
                    else if (ageDays > 5) ageScore = 10;
                    else if (ageDays > 2) ageScore = 5;
                }
                let slaScore = 0;
                const sla = slaByAppId[app.ID];
                if (sla) {
                    const hoursRemaining = (new Date(sla.dueAt) - asOf) / (1000 * 60 * 60);
                    if (hoursRemaining <= 0) slaScore = 50;
                    else if (hoursRemaining <= 24) slaScore = 20;
                    else if (hoursRemaining <= 72) slaScore = 10;
                }
                totalPriority += riskScore + exceptionScore + ageScore + 5 + slaScore;
            });
            const avgPriority = apps.length ? totalPriority / apps.length : 0;

            return {
                totalApplications: apps.length,
                slaBreachedCount: breached,
                slaTotalWithSLA: slas.length,
                slaBreachRate,
                openExceptionsCount: exceptions.filter(e => e.status === 'OPEN').length,
                agedApplicationsCount: agedCount,
                avgApprovalCycleDays: avgCycleDays,
                avgPriorityScore: Math.round(avgPriority * 100) / 100,
                byStatus, bySeverity, byRiskBand, riskByAppId, slaByAppId, exceptionsByAppId
            };
        }

        const currentCore = computeCore(allApps, allSlas, allExceptions, allRisks, allApprovalSteps, now);

        // Approximate "as of 7 days ago": filter to records that existed by then,
        // using createdAt as a stand-in for historical state since no snapshot
        // history is tracked. This is directional, not exact — status changes
        // (e.g. an app moving OPEN -> CLOSED) aren't reflected in the past state.
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        const pastApps = allApps.filter(a => new Date(a.createdAt) <= sevenDaysAgo);
        const pastSlas = allSlas.filter(s => new Date(s.createdAt) <= sevenDaysAgo);
        const pastExceptions = allExceptions.filter(e => new Date(e.createdAt) <= sevenDaysAgo);
        const pastRisks = allRisks.filter(r => new Date(r.createdAt) <= sevenDaysAgo);
        const pastApprovalSteps = allApprovalSteps.filter(s => new Date(s.createdAt) <= sevenDaysAgo);
        const pastCore = computeCore(pastApps, pastSlas, pastExceptions, pastRisks, pastApprovalSteps, sevenDaysAgo);

        function pctDelta(nowVal, pastVal) {
            if (pastVal === null || pastVal === undefined) return null;
            if (pastVal === 0) return nowVal === 0 ? 0 : null;
            return Math.round(((nowVal - pastVal) / pastVal) * 1000) / 10;
        }

        const trends = {
            totalApplicationsTrend: pctDelta(currentCore.totalApplications, pastCore.totalApplications),
            slaBreachedCountTrend: pctDelta(currentCore.slaBreachedCount, pastCore.slaBreachedCount),
            slaBreachRateTrend: pctDelta(currentCore.slaBreachRate, pastCore.slaBreachRate),
            openExceptionsCountTrend: pctDelta(currentCore.openExceptionsCount, pastCore.openExceptionsCount),
            agedApplicationsCountTrend: pctDelta(currentCore.agedApplicationsCount, pastCore.agedApplicationsCount),
            avgPriorityScoreTrend: pctDelta(currentCore.avgPriorityScore, pastCore.avgPriorityScore),
            avgApprovalCycleDaysTrend: pctDelta(currentCore.avgApprovalCycleDays, pastCore.avgApprovalCycleDays)
        };

        // --- Officer workload, with avg age + SLA breached count ---
        const officerWorkload = [];
        for (const officer of allOfficers) {
            const openApps = allApps.filter(a => a.assignedOfficer_ID === officer.ID && OPEN_STATUSES.includes(a.status));
            let totalAge = 0, ageCount = 0, slaBreachedForOfficer = 0;
            openApps.forEach(a => {
                if (a.submittedAt) {
                    totalAge += (now - new Date(a.submittedAt)) / (1000 * 60 * 60 * 24);
                    ageCount++;
                }
                const sla = currentCore.slaByAppId[a.ID];
                if (sla && new Date(sla.dueAt) < now) slaBreachedForOfficer++;
            });
            officerWorkload.push({
                name: officer.name,
                authorityLevel: officer.authorityLevel,
                openCount: openApps.length,
                avgAgeDays: ageCount ? Math.round((totalAge / ageCount) * 10) / 10 : null,
                slaBreachedCount: slaBreachedForOfficer
            });
        }

        // --- Submission trend (unchanged from before) ---
        const dayBuckets = {};
        for (let i = 0; i < 7; i++) {
            const d = new Date(sevenDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
            dayBuckets[d.toISOString().slice(0, 10)] = 0;
        }
        allApps.forEach(a => {
            if (a.submittedAt) {
                const key = new Date(a.submittedAt).toISOString().slice(0, 10);
                if (dayBuckets.hasOwnProperty(key)) dayBuckets[key]++;
            }
        });
        const submissionTrend = Object.entries(dayBuckets).map(([date, count]) => ({ date, count }));

        // --- Top priority applications, with applicant name + issue text ---
        const applicantById = Object.fromEntries(allApplicants.map(a => [a.ID, a]));
        const ruleById = Object.fromEntries(allRules.map(r => [r.ID, r]));
        const scoredApps = allApps.map(app => {
            const risk = currentCore.riskByAppId[app.ID];
            const riskScore = risk ? (RISK_SCORE[risk.riskBand] ?? 0) : 0;
            const exList = currentCore.exceptionsByAppId[app.ID] || [];
            const openExList = exList.filter(e => e.status === 'OPEN');
            const exceptionScore = exList.reduce((max, ex) => Math.max(max, EXCEPTION_SEVERITY_SCORE[ex.severity] ?? 0), 0);
            let ageScore = 0, ageDays = 0;
            if (app.submittedAt) {
                ageDays = (now - new Date(app.submittedAt)) / (1000 * 60 * 60 * 24);
                if (ageDays > 10) ageScore = 20;
                else if (ageDays > 5) ageScore = 10;
                else if (ageDays > 2) ageScore = 5;
            }
            let slaScore = 0;
            const sla = currentCore.slaByAppId[app.ID];
            const slaBreached = sla ? (new Date(sla.dueAt) < now) : false;
            if (sla) {
                const hoursRemaining = (new Date(sla.dueAt) - now) / (1000 * 60 * 60);
                if (hoursRemaining <= 0) slaScore = 50;
                else if (hoursRemaining <= 24) slaScore = 20;
                else if (hoursRemaining <= 72) slaScore = 10;
            }

            let issueText = 'Pending review';
            if (slaBreached) {
                issueText = 'SLA breached';
            } else if (openExList.length) {
                const topEx = openExList.reduce((a, b) => (EXCEPTION_SEVERITY_SCORE[a.severity] ?? 0) >= (EXCEPTION_SEVERITY_SCORE[b.severity] ?? 0) ? a : b);
                issueText = topEx.description || (ruleById[topEx.rule_ID]?.description) || topEx.reasonCode;
            } else if (risk && (risk.riskBand === 'HIGH' || risk.riskBand === 'CRITICAL')) {
                issueText = 'Income verification pending';
            }

            const applicant = applicantById[app.applicant_ID];
            return {
                ID: app.ID,
                applicationNumber: app.applicationNumber,
                applicantName: applicant ? `${applicant.firstName} ${applicant.lastName}` : null,
                score: riskScore + exceptionScore + ageScore + 5 + slaScore,
                slaBreached,
                riskBand: risk ? risk.riskBand : null,
                issueText,
                daysPending: app.submittedAt ? Math.round(ageDays) : null
            };
        });
        scoredApps.sort((a, b) => b.score - a.score);
        const topPriorityApplications = scoredApps.slice(0, 5);

        return {
            totalApplications: currentCore.totalApplications,
            byStatus: Object.entries(currentCore.byStatus).map(([status, count]) => ({ status, count })),
            slaBreachedCount: currentCore.slaBreachedCount,
            slaTotalWithSLA: currentCore.slaTotalWithSLA,
            slaBreachRate: currentCore.slaBreachRate,
            openExceptionsCount: currentCore.openExceptionsCount,
            openExceptionsBySeverity: Object.entries(currentCore.bySeverity).map(([severity, count]) => ({ severity, count })),
            avgPriorityScore: currentCore.avgPriorityScore,
            byRiskBand: Object.entries(currentCore.byRiskBand).map(([riskBand, count]) => ({ riskBand, count })),
            agedApplicationsCount: currentCore.agedApplicationsCount,
            avgApprovalCycleDays: currentCore.avgApprovalCycleDays,
            submissionTrend,
            officerWorkload,
            topPriorityApplications,
            ...trends
        };
    });

    this.on('recommendAssignment', 'LoanApplications', async (req) => {
        let appID = req.params[0];
        if (typeof appID === 'object' && appID !== null) {
            appID = appID.ID;
        }

        const tx = cds.transaction(req);
        const app = await tx.run(SELECT.one.from(LoanApplications, appID));
        const product = await tx.run(SELECT.one.from(LoanProducts).where({ ID: app.product_ID }));
        const officers = await tx.run(SELECT.from(Officers));

        const requestedAmount = parseFloat(app.requestedAmount);

        // Eligibility gate: authority must cover the requested amount
        const eligible = officers.filter(o => parseFloat(o.maxApprovalAmt) >= requestedAmount);

        // Workload: count each officer's currently-open applications, computed live
        const openStatuses = ['VALIDATING', 'EXCEPTION', 'READY_FOR_REVIEW', 'UNDERWRITING'];
        const workloadCounts = {};
        for (const officer of eligible) {
            const openApps = await tx.run(
                SELECT.from(LoanApplications).where({
                    assignedOfficer_ID: officer.ID,
                    status: { in: openStatuses }
                })
            );
            workloadCounts[officer.ID] = openApps.length;
        }

        const maxWorkload = Math.max(1, ...Object.values(workloadCounts));

        const scored = eligible.map(o => {
            const expertiseMatch = o.expertise === product.category;
            const workload = workloadCounts[o.ID];

            // Weighted score: expertise 40%, workload 40% (inverted, fewer = better), authority headroom 20%
            const expertiseScore = expertiseMatch ? 40 : 0;
            const workloadScore = 40 * (1 - workload / maxWorkload);
            const headroom = parseFloat(o.maxApprovalAmt) - requestedAmount;
            const authorityScore = 20 * Math.min(1, headroom / requestedAmount);

            const score = expertiseScore + workloadScore + authorityScore;

            const rationaleParts = [];
            rationaleParts.push(expertiseMatch ? `${o.expertise} expertise matches` : `no expertise match (has ${o.expertise})`);
            rationaleParts.push(`${workload} open application(s)`);
            rationaleParts.push(`${o.authorityLevel} authority`);

            return {
                officerID: o.ID,
                name: o.name,
                authorityLevel: o.authorityLevel,
                expertiseMatch,
                openWorkload: workload,
                score: Math.round(score * 100) / 100,
                rationale: rationaleParts.join(', ')
            };
        });

        scored.sort((a, b) => b.score - a.score);

        return scored.slice(0, 3);
    });


});