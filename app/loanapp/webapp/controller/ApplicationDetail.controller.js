sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "loan/cockpit/loanapp/controller/SidebarHelper"
], function (Controller, JSONModel, SidebarHelper) {
    "use strict";

    return Controller.extend("loan.cockpit.loanapp.controller.ApplicationDetail", {
        onInit: function () {
            this.getView().setModel(new JSONModel({ activeTab: "overview" }), "ui");
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
            `/odata/v4/loan-application/LoanApplications(${this._sID})?$expand=applicant,product,documents,creditChecks,riskAssessments,exceptions,approvalSteps,assignedOfficer`,
            { headers: { "Accept": "application/json" } }
        );
        const data = await res.json();
        this._shapeAndSetModel(data);
        this._setGreetingModel();
    } catch (e) {
        console.error("Failed to load application detail:", e);
    }
},

formatTabClass: function (sActiveTab, sThisTab) {
    return sActiveTab === sThisTab ? "detailTabItem detailTabActive" : "detailTabItem";
},

        _shapeAndSetModel: function (app) {
            const statusMap = { EXCEPTION: "appsPillRed", READY_FOR_REVIEW: "appsPillGreen", SUBMITTED: "appsPillBlue", DRAFT: "appsPillGray", APPROVED: "appsPillGreen", REJECTED: "appsPillGray" };
            app.statusClass = statusMap[app.status] || "appsPillGray";
            app.subtitle = `${app.product ? app.product.productName : ""} · Submitted on ${app.submittedAt ? new Date(app.submittedAt).toLocaleString() : "—"}`;
            app.submittedAtLabel = app.submittedAt ? new Date(app.submittedAt).toLocaleString() : "—";
            app.canApprove = app.status === "READY_FOR_REVIEW";
            app.canReject = ["READY_FOR_REVIEW", "EXCEPTION", "UNDERWRITING"].includes(app.status);
            app.canEscalate = !["APPROVED", "REJECTED", "CLOSED"].includes(app.status);
            app.hasPendingCreditCheck = (app.creditChecks || []).some(c => c.status === "PENDING");
            app.hasPendingRiskAssessment = (app.riskAssessments || []).some(r => r.riskBand === "PENDING");
app.assignedOfficerName = app.assignedOfficer ? `${app.assignedOfficer.name} (${app.assignedOfficer.authorityLevel})` : "Unassigned";

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
        onDelete: function () {
            const sAppNumber = this.getView().getModel("app").getProperty("/applicationNumber");
            sap.m.MessageBox.confirm(
                `Are you sure you want to delete application ${sAppNumber}? This action cannot be undone.`,
                {
                    title: "Delete Application",
                    actions: [sap.m.MessageBox.Action.DELETE, sap.m.MessageBox.Action.CANCEL],
                    emphasizedAction: sap.m.MessageBox.Action.DELETE,
                    onClose: (sAction) => {
                        if (sAction === sap.m.MessageBox.Action.DELETE) {
                            this._performDelete();
                        }
                    }
                }
            );
        },

        _performDelete: async function () {
            try {
                const res = await fetch(`/odata/v4/loan-application/LoanApplications(${this._sID})`, {
                    method: "DELETE"
                });
                if (!res.ok) throw new Error("Delete failed");
                sap.m.MessageToast.show("Application deleted");
                this.getOwnerComponent().getRouter().navTo("ApplicationsHome");
            } catch (e) {
                sap.m.MessageToast.show(`Error: ${e.message}`);
            }
        },
        onMorePress: function () { sap.m.MessageToast.show("More actions coming soon"); },

        onTabPress: function (oEvent) {
    const sId = oEvent.getSource().getId();
    const tabMap = {
        tabOverview: "overview",
        tabApplicant: "applicant",
        tabProduct: "product",
        tabExceptions: "exceptions",
        tabDocuments: "documents",
        tabCredit: "credit",
        tabRisk: "risk",
        tabHistory: "history"
    };
    const sTab = tabMap[sId];
    if (sTab) {
        this.getView().getModel("ui").setProperty("/activeTab", sTab);
    }
},

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("ApplicationsHome");
        },

        onAfterRendering: function () {
            if (this._sidebarWired) return;
            this._sidebarWired = true;
            SidebarHelper.wireSidebar(this, "Applications");
             SidebarHelper.wireGlobalSearch(this);
        },

        onEditApplicant: function () {
            const oAppModel = this.getView().getModel("app");
            const oApplicant = oAppModel.getProperty("/applicant");
            this.getView().setModel(new JSONModel({
                firstName: oApplicant.firstName,
                lastName: oApplicant.lastName,
                email: oApplicant.email,
                phone: oApplicant.phone
            }), "edit");
            this.byId("editApplicantDialog").open();
        },

        onCancelApplicantEdit: function () {
            this.byId("editApplicantDialog").close();
        },

        onSaveApplicantEdit: async function () {
            const oEditModel = this.getView().getModel("edit");
            const oApplicant = this.getView().getModel("app").getProperty("/applicant");
            try {
                const res = await fetch(`/odata/v4/loan-application/Applicants(${oApplicant.ID})`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(oEditModel.getData())
                });
                if (!res.ok) throw new Error("Update failed");
                sap.m.MessageToast.show("Applicant updated");
                this.byId("editApplicantDialog").close();
                this._loadDetail();
            } catch (e) {
                sap.m.MessageToast.show(`Error: ${e.message}`);
            }
        },

        onEditLoanDetails: function () {
            const oAppModel = this.getView().getModel("app");
            this.getView().setModel(new JSONModel({
                requestedAmount: oAppModel.getProperty("/requestedAmount"),
                tenureMonths: oAppModel.getProperty("/tenureMonths")
            }), "edit");
            this.byId("editLoanDetailsDialog").open();
        },

        onCancelLoanDetailsEdit: function () {
            this.byId("editLoanDetailsDialog").close();
        },

        onSaveLoanDetailsEdit: async function () {
            const oEditModel = this.getView().getModel("edit");
            try {
                const res = await fetch(`/odata/v4/loan-application/LoanApplications(${this._sID})`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        requestedAmount: parseFloat(oEditModel.getProperty("/requestedAmount")),
                        tenureMonths: parseInt(oEditModel.getProperty("/tenureMonths"), 10)
                    })
                });
                if (!res.ok) throw new Error("Update failed");
                sap.m.MessageToast.show("Loan details updated");
                this.byId("editLoanDetailsDialog").close();
                this._loadDetail();
            } catch (e) {
                sap.m.MessageToast.show(`Error: ${e.message}`);
            }
        },


        onUploadDocument: function () {
            this.getView().setModel(new JSONModel({
                docType: "ID_PROOF",
                canSubmit: false
            }), "upload");
            this._oSelectedFile = null;
            this.byId("documentFileUploader").clear();
            this.byId("uploadDocumentDialog").open();
        },

        onCancelUpload: function () {
            this.byId("uploadDocumentDialog").close();
        },

        onFileSelected: function (oEvent) {
            const oFiles = oEvent.getParameter("files");
            this._oSelectedFile = (oFiles && oFiles.length) ? oFiles[0] : null;
            this.getView().getModel("upload").setProperty("/canSubmit", !!this._oSelectedFile);
        },

        onConfirmUpload: async function () {
            if (!this._oSelectedFile) {
                sap.m.MessageToast.show("Please choose a file first.");
                return;
            }
            const oUploadModel = this.getView().getModel("upload");
            const sDocType = oUploadModel.getProperty("/docType");
            const oFile = this._oSelectedFile;

            try {
                const createRes = await fetch("/odata/v4/loan-application/Documents", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        application_ID: this._sID,
                        docType: sDocType,
                        fileName: oFile.name,
                        mediaType: oFile.type || "application/octet-stream",
                        status: "PENDING"
                    })
                });
                if (!createRes.ok) throw new Error("Failed to create document record");
                const newDoc = await createRes.json();

                const putRes = await fetch(`/odata/v4/loan-application/Documents(${newDoc.ID})/content`, {
                    method: "PUT",
                    headers: { "Content-Type": oFile.type || "application/octet-stream" },
                    body: oFile
                });
                if (!putRes.ok) throw new Error("Failed to upload file content");

                sap.m.MessageToast.show("Document uploaded");
                this.byId("uploadDocumentDialog").close();
                this._loadDetail();
            } catch (e) {
                sap.m.MessageToast.show(`Upload error: ${e.message}`);
            }
        },

        onDownloadDocument: function (oEvent) {
            const oCtx = oEvent.getSource().getBindingContext("app");
            const sDocId = oCtx.getProperty("ID");
            window.open(`/odata/v4/loan-application/Documents(${sDocId})/content`, "_blank");
        },

        onCompleteCreditCheck: function () {
            this.getView().setModel(new JSONModel({ mode: "manual", score: "", grade: "A" }), "credit");
            this.byId("completeCreditCheckDialog").open();
        },

        onCancelCreditCheck: function () {
            this.byId("completeCreditCheckDialog").close();
        },

        onCreditModeChange: function (oEvent) {
            this.getView().getModel("credit").setProperty("/mode", oEvent.getParameter("item").getKey());
        },

        onSubmitCreditCheck: async function () {
            const oAppModel = this.getView().getModel("app");
            const oCreditModel = this.getView().getModel("credit");
            const mode = oCreditModel.getProperty("/mode");
            const pendingCheck = (oAppModel.getProperty("/creditChecks") || []).find(c => c.status === "PENDING");
            if (!pendingCheck) {
                sap.m.MessageToast.show("No pending credit check found.");
                return;
            }

            let score, grade;
            if (mode === "manual") {
                score = parseInt(oCreditModel.getProperty("/score"), 10);
                grade = oCreditModel.getProperty("/grade");
                if (!score || score < 300 || score > 900) {
                    sap.m.MessageToast.show("Please enter a valid score between 300 and 900.");
                    return;
                }
            } else {
              const requestedAmount = parseFloat(oAppModel.getProperty("/requestedAmount"));
const maxAmount = parseFloat(oAppModel.getProperty("/product/maxAmount")) || requestedAmount * 2;
const ratio = requestedAmount / maxAmount;
                score = Math.round(850 - ratio * 300 + (Math.random() * 60 - 30));
                score = Math.max(300, Math.min(900, score));
                grade = score >= 750 ? "A" : score >= 650 ? "B" : score >= 550 ? "C" : "D";
            }

            try {
                const res = await fetch(`/odata/v4/loan-application/CreditChecks(${pendingCheck.ID})`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        score, grade,
                        status: "AVAILABLE",
                        checkedAt: new Date().toISOString(),
                        validityDays: 90
                    })
                });
                if (!res.ok) throw new Error("Update failed");
                sap.m.MessageToast.show("Credit check completed");
                this.byId("completeCreditCheckDialog").close();
                this._loadDetail();
            } catch (e) {
                sap.m.MessageToast.show(`Error: ${e.message}`);
            }
        },

        onCompleteRiskAssessment: function () {
            this.getView().setModel(new JSONModel({ mode: "manual", riskBand: "MEDIUM", riskScore: "", collateralCoverage: "", rationale: "" }), "risk");
            this.byId("completeRiskAssessmentDialog").open();
        },

        onCancelRiskAssessment: function () {
            this.byId("completeRiskAssessmentDialog").close();
        },

        onRiskModeChange: function (oEvent) {
            this.getView().getModel("risk").setProperty("/mode", oEvent.getParameter("item").getKey());
        },

        onSubmitRiskAssessment: async function () {
            const oAppModel = this.getView().getModel("app");
            const oRiskModel = this.getView().getModel("risk");
            const mode = oRiskModel.getProperty("/mode");
            const pendingRisk = (oAppModel.getProperty("/riskAssessments") || []).find(r => r.riskBand === "PENDING");
            if (!pendingRisk) {
                sap.m.MessageToast.show("No pending risk assessment found.");
                return;
            }

            let riskBand, riskScore, collateralCoverage, rationale;
            if (mode === "manual") {
                riskBand = oRiskModel.getProperty("/riskBand");
                riskScore = parseInt(oRiskModel.getProperty("/riskScore"), 10);
                collateralCoverage = parseFloat(oRiskModel.getProperty("/collateralCoverage")) || 0;
                rationale = oRiskModel.getProperty("/rationale") || "";
                if (!riskScore) {
                    sap.m.MessageToast.show("Please enter a risk score.");
                    return;
                }
            } else {
                const requestedAmount = parseFloat(oAppModel.getProperty("/requestedAmount"));
const maxAmount = parseFloat(oAppModel.getProperty("/product/maxAmount")) || requestedAmount * 2;
const ratio = requestedAmount / maxAmount;
                riskScore = Math.round(ratio * 100);
                riskBand = ratio > 0.75 ? "CRITICAL" : ratio > 0.5 ? "HIGH" : ratio > 0.25 ? "MEDIUM" : "LOW";
                collateralCoverage = Math.round((1 - ratio) * 100 * 100) / 100;
                rationale = `Auto-generated: requested amount is ${Math.round(ratio * 100)}% of the product's maximum limit.`;
            }

            try {
                const res = await fetch(`/odata/v4/loan-application/RiskAssessments(${pendingRisk.ID})`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ riskBand, riskScore, collateralCoverage, rationale })
                });
                if (!res.ok) throw new Error("Update failed");
                sap.m.MessageToast.show("Risk assessment completed");
                this.byId("completeRiskAssessmentDialog").close();
                this._loadDetail();
            } catch (e) {
                sap.m.MessageToast.show(`Error: ${e.message}`);
            }
        },

        onOpenAssignOfficer: async function () {
    this.getView().setModel(new JSONModel({ loading: true, candidates: [], selectedOfficerId: null, canSubmit: false }), "assign");
    this.byId("assignOfficerDialog").open();

    try {
        const oModel = this.getOwnerComponent().getModel();
        const oOperation = oModel.bindContext(`/LoanApplications(${this._sID})/LoanApplicationService.recommendAssignment(...)`);
        await oOperation.execute();
        const result = oOperation.getBoundContext().getObject();
        const candidates = Array.isArray(result.value) ? result.value : (result || []);
        this.getView().getModel("assign").setProperty("/candidates", candidates);
        this.getView().getModel("assign").setProperty("/loading", false);
    } catch (e) {
        sap.m.MessageToast.show(`Failed to load recommendations: ${e.message}`);
        this.getView().getModel("assign").setProperty("/loading", false);
    }
},

onCandidateSelect: function (oEvent) {
    const oCtx = oEvent.getParameter("listItem").getBindingContext("assign");
    this.getView().getModel("assign").setProperty("/selectedOfficerId", oCtx.getProperty("officerID"));
    this.getView().getModel("assign").setProperty("/canSubmit", true);
},

onCancelAssignOfficer: function () {
    this.byId("assignOfficerDialog").close();
},

onConfirmAssignOfficer: async function () {
    const officerId = this.getView().getModel("assign").getProperty("/selectedOfficerId");
    if (!officerId) {
        sap.m.MessageToast.show("Please select an officer.");
        return;
    }
    try {
        const res = await fetch(`/odata/v4/loan-application/LoanApplications(${this._sID})`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assignedOfficer_ID: officerId })
        });
        if (!res.ok) throw new Error("Assignment failed");
        sap.m.MessageToast.show("Officer assigned");
        this.byId("assignOfficerDialog").close();
        this._loadDetail();
    } catch (e) {
        sap.m.MessageToast.show(`Error: ${e.message}`);
    }
},

onDeleteDocument: function (oEvent) {
    const oCtx = oEvent.getSource().getBindingContext("app");
    const sDocId = oCtx.getProperty("ID");
    const sFileName = oCtx.getProperty("fileName");

    sap.m.MessageBox.confirm(
        `Delete "${sFileName}"? This cannot be undone.`,
        {
            title: "Delete Document",
            actions: [sap.m.MessageBox.Action.DELETE, sap.m.MessageBox.Action.CANCEL],
            emphasizedAction: sap.m.MessageBox.Action.DELETE,
            onClose: (sAction) => {
                if (sAction === sap.m.MessageBox.Action.DELETE) {
                    this._performDocumentDelete(sDocId);
                }
            }
        }
    );
},

_performDocumentDelete: async function (sDocId) {
    try {
        const res = await fetch(`/odata/v4/loan-application/Documents(${sDocId})`, {
            method: "DELETE"
        });
        if (!res.ok) throw new Error("Delete failed");
        sap.m.MessageToast.show("Document deleted");
        this._loadDetail();
    } catch (e) {
        sap.m.MessageToast.show(`Error: ${e.message}`);
    }
},

    });
});