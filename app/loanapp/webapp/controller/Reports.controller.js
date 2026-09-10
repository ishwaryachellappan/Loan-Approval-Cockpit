sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "loan/cockpit/loanapp/controller/SidebarHelper"
], function (Controller, JSONModel, SidebarHelper) {
    "use strict";

    return Controller.extend("loan.cockpit.loanapp.controller.Reports", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                kpi: { total: 0, approvalRate: 0, avgCycleDays: null, exceptionRate: 0 },
                exceptionReasons: [],
                productMix: [],
                officerPerformance: []
            }), "reports");
            this._setGreetingModel();

            this.getOwnerComponent().getRouter().getRoute("ReportsHome")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._loadReports();
        },

        _setGreetingModel: function () {
            this.getView().setModel(new JSONModel({ initials: "IC", name: "Ishwarya Chellappan", role: "Operations Manager" }), "user");
        },

        _loadReports: async function () {
            try {
                const [appsRes, exceptionsRes, officersRes, stepsRes] = await Promise.all([
                    fetch("/odata/v4/loan-application/LoanApplications?$expand=product,assignedOfficer", { headers: { "Accept": "application/json" } }),
                    fetch("/odata/v4/loan-application/Exceptions?$filter=status eq 'OPEN'", { headers: { "Accept": "application/json" } }),
                    fetch("/odata/v4/loan-application/Officers", { headers: { "Accept": "application/json" } }),
                    fetch("/odata/v4/loan-application/ApprovalSteps", { headers: { "Accept": "application/json" } })
                ]);
                const apps = (await appsRes.json()).value;
                const exceptions = (await exceptionsRes.json()).value;
                const officers = (await officersRes.json()).value;
                const steps = (await stepsRes.json()).value;

                const total = apps.length;
                const approved = apps.filter(a => a.status === "APPROVED").length;
                const rejected = apps.filter(a => a.status === "REJECTED").length;
                const decided = approved + rejected;
                const approvalRate = decided ? Math.round((approved / decided) * 1000) / 10 : 0;

                const appsWithException = new Set(exceptions.map(e => e.application_ID)).size;
                const exceptionRate = total ? Math.round((appsWithException / total) * 1000) / 10 : 0;

                const appById = Object.fromEntries(apps.map(a => [a.ID, a]));
                let totalCycleDays = 0, cycleCount = 0;
                steps.forEach(step => {
                    const app = appById[step.application_ID];
                    if (app && app.submittedAt && step.decidedAt) {
                        totalCycleDays += (new Date(step.decidedAt) - new Date(app.submittedAt)) / (1000 * 60 * 60 * 24);
                        cycleCount++;
                    }
                });
                const avgCycleDays = cycleCount ? Math.round((totalCycleDays / cycleCount) * 10) / 10 : null;

                const reasonCounts = {};
                exceptions.forEach(e => { reasonCounts[e.reasonCode] = (reasonCounts[e.reasonCode] || 0) + 1; });
                const exceptionReasons = Object.entries(reasonCounts)
                    .map(([reason, count]) => ({ reason, count }))
                    .sort((a, b) => b.count - a.count);

                const productCounts = {};
                apps.forEach(a => {
                    const name = a.product ? a.product.productName : "Unknown";
                    productCounts[name] = (productCounts[name] || 0) + 1;
                });
                const productMix = Object.entries(productCounts).map(([product, count]) => ({ product, count }));

                const officerPerformance = officers.map(o => {
                    const assignedApps = apps.filter(a => a.assignedOfficer_ID === o.ID);
                    const oApproved = assignedApps.filter(a => a.status === "APPROVED").length;
                    const oRejected = assignedApps.filter(a => a.status === "REJECTED").length;
                    const oOpen = assignedApps.length - oApproved - oRejected;
                    const oDecided = oApproved + oRejected;
                    return {
                        name: o.name,
                        assigned: assignedApps.length,
                        approved: oApproved,
                        rejected: oRejected,
                        open: oOpen,
                        approvalRate: oDecided ? Math.round((oApproved / oDecided) * 1000) / 10 : 0
                    };
                });

                const model = this.getView().getModel("reports");
                model.setProperty("/kpi", { total, approvalRate, avgCycleDays, exceptionRate });
                model.setProperty("/exceptionReasons", exceptionReasons);
                model.setProperty("/productMix", productMix);
                model.setProperty("/officerPerformance", officerPerformance);
            } catch (e) {
                console.error("Failed to load reports:", e);
            }
        },

        onAfterRendering: function () {
            if (this._sidebarWired) return;
            this._sidebarWired = true;
            SidebarHelper.wireSidebar(this, "Reports");
        }
    });
});