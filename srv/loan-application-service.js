const cds = require('@sap/cds');

module.exports = cds.service.impl(async function () {
    const { Documents, CreditChecks, Exceptions, Rules, LoanApplications, ApprovalSteps, AuditLogs } = this.entities;

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
        const expiredDoc = documents.find(d => d.status === 'EXPIRED');
        if (expiredDoc) {
            newExceptions.push({
                application_ID: appID,
                rule_ID: ruleByCode('L6-DOCUMENT-MISSING')?.ID,
                reasonCode: 'DOC_EXPIRED', severity: 'Critical', status: 'OPEN',
                description: `${expiredDoc.docType} expired on ${expiredDoc.expiryDate}`,
                suggestedAction: 'Request updated document from applicant'
            });
        }
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
        const tx = cds.transaction(req);
        const app = await tx.run(SELECT.one.from(LoanApplications, appID));

        if (app.status !== 'READY_FOR_REVIEW') {
            req.error(400, `Cannot approve from status ${app.status}. Application must be READY_FOR_REVIEW.`);
            return false;
        }
        const { approver = 'unknown', comments = '' } = req.data;
        await recordApprovalStep(tx, appID, approver, 'APPROVED', comments);
        await tx.run(UPDATE(LoanApplications, appID).with({ status: 'APPROVED' }));
        await recordAudit(tx, appID, approver, app.status, 'APPROVED', comments || 'Approved by officer');
        return true;
    });

    // --- reject ---
    this.on('reject', 'LoanApplications', async (req) => {
        let appID = req.params[0];
        if (typeof appID === 'object' && appID !== null) appID = appID.ID;
        const tx = cds.transaction(req);
        const app = await tx.run(SELECT.one.from(LoanApplications, appID));

        if (!['READY_FOR_REVIEW', 'EXCEPTION', 'UNDERWRITING'].includes(app.status)) {
            req.error(400, `Cannot reject from status ${app.status}.`);
            return false;
        }
        const { approver = 'unknown', comments = '' } = req.data;
        await recordApprovalStep(tx, appID, approver, 'REJECTED', comments);
        await tx.run(UPDATE(LoanApplications, appID).with({ status: 'REJECTED' }));
        await recordAudit(tx, appID, approver, app.status, 'REJECTED', comments || 'Rejected by officer');
        return true;
    });

    // --- escalate ---
    this.on('escalate', 'LoanApplications', async (req) => {
        let appID = req.params[0];
        if (typeof appID === 'object' && appID !== null) appID = appID.ID;
        const tx = cds.transaction(req);
        const app = await tx.run(SELECT.one.from(LoanApplications, appID));

        if (['APPROVED', 'REJECTED', 'CLOSED'].includes(app.status)) {
            req.error(400, `Cannot escalate a ${app.status} application.`);
            return false;
        }
        const { approver = 'unknown', comments = '' } = req.data;
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
    const apps = await tx.run(SELECT.from(LoanApplications));
    const slas = await tx.run(SELECT.from('SLAs'));
    const exceptions = await tx.run(SELECT.from(Exceptions).where({ status: 'OPEN' }));
    const risks = await tx.run(SELECT.from('RiskAssessments'));
    const approvalSteps = await tx.run(SELECT.from(ApprovalSteps));

    const byStatus = {};
    apps.forEach(a => byStatus[a.status] = (byStatus[a.status] || 0) + 1);

    const now = new Date();
    let breached = 0;
    slas.forEach(s => { if (new Date(s.dueAt) < now) breached++; });
    const slaBreachRate = slas.length ? Math.round((breached / slas.length) * 1000) / 10 : 0;

    const bySeverity = {};
    exceptions.forEach(e => bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1);

    const byRiskBand = {};
    risks.forEach(r => byRiskBand[r.riskBand] = (byRiskBand[r.riskBand] || 0) + 1);

    // --- Queue ageing: applications older than 5 days, still not closed ---
    const OPEN_STATUSES = ['DRAFT', 'SUBMITTED', 'VALIDATING', 'EXCEPTION', 'READY_FOR_REVIEW', 'UNDERWRITING'];
    let agedCount = 0;
    apps.forEach(a => {
        if (OPEN_STATUSES.includes(a.status) && a.submittedAt) {
            const ageDays = (now - new Date(a.submittedAt)) / (1000 * 60 * 60 * 24);
            if (ageDays > 5) agedCount++;
        }
    });

    // --- Approval cycle time: avg days from submittedAt to decidedAt ---
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

    // --- Priority score recompute (unchanged from before) ---
    const RISK_SCORE = { LOW: 10, MEDIUM: 25, HIGH: 40, CRITICAL: 55 };
    const EXCEPTION_SEVERITY_SCORE = { Minor: 5, Major: 15, Critical: 30 };
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
            const ageDays = (now - new Date(app.submittedAt)) / (1000 * 60 * 60 * 24);
            if (ageDays > 10) ageScore = 20;
            else if (ageDays > 5) ageScore = 10;
            else if (ageDays > 2) ageScore = 5;
        }
        let slaScore = 0;
        const sla = slaByAppId[app.ID];
        if (sla) {
            const hoursRemaining = (new Date(sla.dueAt) - now) / (1000 * 60 * 60);
            if (hoursRemaining <= 0) slaScore = 50;
            else if (hoursRemaining <= 24) slaScore = 20;
            else if (hoursRemaining <= 72) slaScore = 10;
        }
        totalPriority += riskScore + exceptionScore + ageScore + 5 + slaScore;
    });
    const avgPriority = apps.length ? totalPriority / apps.length : 0;

    return {
        totalApplications: apps.length,
        byStatus: Object.entries(byStatus).map(([status, count]) => ({ status, count })),
        slaBreachedCount: breached,
        slaTotalWithSLA: slas.length,
        slaBreachRate,
        openExceptionsCount: exceptions.length,
        openExceptionsBySeverity: Object.entries(bySeverity).map(([severity, count]) => ({ severity, count })),
        avgPriorityScore: Math.round(avgPriority * 100) / 100,
        byRiskBand: Object.entries(byRiskBand).map(([riskBand, count]) => ({ riskBand, count })),
        agedApplicationsCount: agedCount,
        avgApprovalCycleDays: avgCycleDays
    };
});


});