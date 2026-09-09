sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "loan/cockpit/loanapp/controller/SidebarHelper"
], function (Controller, JSONModel, SidebarHelper) {
    "use strict";

    return Controller.extend("loan.cockpit.loanapp.controller.ApplicationDetail", {
        onInit: function () {
            this.getOwnerComponent().getRouter().getRoute("ApplicationDetail")
                .attachPatternMatched(this._onMatched, this);
        },

        _onMatched: function (oEvent) {
            this._sID = oEvent.getParameter("arguments").key;
            this._loadDetail();
        },

        _loadDetail: async function () {
            try {
                const res = await fetch(
                    `/odata/v4/loan-application/LoanApplications(${this._sID})?$expand=applicant,product,documents,creditChecks,riskAssessments,exceptions,approvalSteps`,
                    { headers: { "Accept": "application/json" } }
                );
                const data = await res.json();
                this._shapeAndSetModel(data);
                this._setGreetingModel();
            } catch (e) {
                console.error("Failed to load application detail:", e);
            }
        },

        _shapeAndSetModel: function (app) {
            const statusMap = { EXCEPTION: "appsPillRed", READY_FOR_REVIEW: "appsPillGreen", SUBMITTED: "appsPillBlue", DRAFT: "appsPillGray", APPROVED: "appsPillGreen", REJECTED: "appsPillGray" };
            app.statusClass = statusMap[app.status] || "appsPillGray";
            app.subtitle = `${app.product ? app.product.productName : ""} · Submitted on ${app.submittedAt ? new Date(app.submittedAt).toLocaleString() : "—"}`;
            app.submittedAtLabel = app.submittedAt ? new Date(app.submittedAt).toLocaleString() : "—";
            app.canApprove = app.status === "READY_FOR_REVIEW";
            app.canReject = ["READY_FOR_REVIEW", "EXCEPTION", "UNDERWRITING"].includes(app.status);
            app.canEscalate = !["APPROVED", "REJECTED", "CLOSED"].includes(app.status);

            const sevClass = { Critical: "appsPillRed", Major: "appsPillOrange", Minor: "appsPillGray" };
            (app.exceptions || []).forEach(e => e.severityClass = sevClass[e.severity] || "appsPillGray");

            const docClass = { EXPIRED: "appsPillRed", VERIFIED: "appsPillGreen", PENDING: "appsPillOrange", REJECTED: "appsPillGray" };
            (app.documents || []).forEach(d => {
                d.docStatusClass = docClass[d.status] || "appsPillGray";
                d.expiryDateLabel = d.expiryDate || "—";
            });

            const creditClass = { AVAILABLE: "appsPillGreen", STALE: "appsPillOrange", MISMATCH: "appsPillRed" };
            (app.creditChecks || []).forEach(c => {
                c.creditStatusClass = creditClass[c.status] || "appsPillGray";
                c.checkedAtLabel = c.checkedAt ? new Date(c.checkedAt).toLocaleString() : "—";
            });

            const riskClass = { LOW: "appsPillGreen", MEDIUM: "appsPillOrange", HIGH: "appsPillRed", CRITICAL: "appsPillRed" };
            (app.riskAssessments || []).forEach(r => r.riskBandClass = riskClass[r.riskBand] || "appsPillGray");

            (app.approvalSteps || []).forEach(s => s.decidedAtLabel = s.decidedAt ? new Date(s.decidedAt).toLocaleString() : "—");

            this.getView().setModel(new JSONModel(app), "app");
        },

        _setGreetingModel: function () {
            this.getView().setModel(new JSONModel({ initials: "IC", name: "Ishwarya Chellappan", role: "Operations Manager" }), "user");
        },

        _callAction: async function (sActionName, sLabel, oExtraParams) {
            const oModel = this.getOwnerComponent().getModel();
            const sPath = `/LoanApplications(${this._sID})`;
            const oOperation = oModel.bindContext(`${sPath}/LoanApplicationService.${sActionName}(...)`);
            if (oExtraParams) {
                Object.keys(oExtraParams).forEach(k => oOperation.setParameter(k, oExtraParams[k]));
            }
            try {
                await oOperation.execute();
                sap.m.MessageToast.show(`${sLabel} successful`);
                this._loadDetail();
            } catch (e) {
                sap.m.MessageToast.show(`${sLabel} failed: ${e.message}`);
            }
        },

        onApprove: function () { this._callAction("approve", "Approve", { comments: "Approved via cockpit" }); },
        onReject: function () { this._callAction("reject", "Reject", { comments: "Rejected via cockpit" }); },
        onEscalate: function () { this._callAction("escalate", "Escalate", { comments: "Escalated via cockpit" }); },
        onRunValidation: function () { this._callAction("runValidation", "Run Validation"); },
        onDelete: function () { sap.m.MessageToast.show("Delete not yet implemented"); },
        onMorePress: function () { sap.m.MessageToast.show("More actions coming soon"); },

        onTabPress: function (oEvent) {
            const sId = oEvent.getSource().getId();
            // Placeholder: full section show/hide wiring can be added once sections are split into named containers
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("ApplicationsHome");
        },

        onAfterRendering: function () {
            if (this._sidebarWired) return;
            this._sidebarWired = true;
            SidebarHelper.wireSidebar(this, "Applications");
        }
    });
});