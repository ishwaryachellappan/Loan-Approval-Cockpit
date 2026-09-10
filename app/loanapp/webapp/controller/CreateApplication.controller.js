sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "loan/cockpit/loanapp/controller/SidebarHelper"
], function (Controller, JSONModel, MessageToast, SidebarHelper) {
    "use strict";

    return Controller.extend("loan.cockpit.loanapp.controller.CreateApplication", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                applicantMode: "existing",
                existingLookupMode: "byName",
                existingApplicantId: "",
                existingApplicationId: "",
                newApplicant: { firstName: "", lastName: "", email: "", phone: "" },
                productId: "",
                requestedAmount: "",
                tenureMonths: "",
                amountHint: "",
                applicants: [],
                products: [],
                existingApplications: []
            }), "create");
            this._loadLookups();
        },

        _loadLookups: async function () {
            try {
                const [applicantsRes, productsRes, appsRes] = await Promise.all([
                    fetch("/odata/v4/loan-application/Applicants", { headers: { "Accept": "application/json" } }),
                    fetch("/odata/v4/loan-application/LoanProducts", { headers: { "Accept": "application/json" } }),
                    fetch("/odata/v4/loan-application/LoanApplications?$expand=applicant", { headers: { "Accept": "application/json" } })
                ]);
                const applicantsData = await applicantsRes.json();
                const productsData = await productsRes.json();
                const appsData = await appsRes.json();

                const existingApplications = appsData.value.map(a => ({
                    ID: a.ID,
                    applicationNumber: a.applicationNumber,
                    applicantName: a.applicant ? `${a.applicant.firstName} ${a.applicant.lastName}` : "Unknown",
                    applicantId: a.applicant_ID
                }));

                const model = this.getView().getModel("create");
                model.setProperty("/applicants", applicantsData.value);
                model.setProperty("/products", productsData.value);
                model.setProperty("/existingApplications", existingApplications);
            } catch (e) {
                console.error("Failed to load lookups:", e);
            }
        },

        onLookupModeChange: function (oEvent) {
            this.getView().getModel("create").setProperty("/existingLookupMode", oEvent.getParameter("item").getKey());
        },

        onExistingApplicationChange: function () {
            const model = this.getView().getModel("create");
            const appId = model.getProperty("/existingApplicationId");
            const match = model.getProperty("/existingApplications").find(a => a.ID === appId);
            if (match) {
                model.setProperty("/existingApplicantId", match.applicantId);
            }
        },

        onApplicantModeChange: function (oEvent) {
            this.getView().getModel("create").setProperty("/applicantMode", oEvent.getParameter("item").getKey());
        },

        onProductChange: function () {
            const model = this.getView().getModel("create");
            const productId = model.getProperty("/productId");
            const product = model.getProperty("/products").find(p => p.ID === productId);
            if (product) {
                model.setProperty("/amountHint", `Range: ₹${product.minAmount} – ₹${product.maxAmount}`);
            }
        },

      onSubmit: async function () {
    const model = this.getView().getModel("create");
    const data = model.getData();

    if (!data.productId || !data.requestedAmount || !data.tenureMonths) {
        MessageToast.show("Please fill in product, amount, and tenure.");
        return;
    }
    if (data.applicantMode === "existing" && !data.existingApplicantId) {
        MessageToast.show("Please select an applicant.");
        return;
    }
    if (data.applicantMode === "new" && (!data.newApplicant.firstName || !data.newApplicant.lastName)) {
        MessageToast.show("Please enter at least first and last name for the new applicant.");
        return;
    }

    try {
        let applicantId = data.existingApplicantId;

        if (data.applicantMode === "new") {
            const res = await fetch("/odata/v4/loan-application/Applicants", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data.newApplicant)
            });
            if (!res.ok) throw new Error("Failed to create applicant");
            const newApplicant = await res.json();
            applicantId = newApplicant.ID;
        }

        const appNumber = await this._generateApplicationNumber();

        const appRes = await fetch("/odata/v4/loan-application/LoanApplications", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                applicationNumber: appNumber,
                applicant_ID: applicantId,
                product_ID: data.productId,
                requestedAmount: parseFloat(data.requestedAmount),
                tenureMonths: parseInt(data.tenureMonths, 10),
                status: "DRAFT"
            })
        });
        if (!appRes.ok) throw new Error("Failed to create application");
        const newApp = await appRes.json();

        // Auto-assign an officer using the existing recommendation engine —
        // picks the top-ranked eligible officer; can be changed later from the detail page.
        try {
            const oModel = this.getOwnerComponent().getModel();
            const oOperation = oModel.bindContext(`/LoanApplications(${newApp.ID})/LoanApplicationService.recommendAssignment(...)`);
            await oOperation.execute();
            const result = oOperation.getBoundContext().getObject();
            const candidates = Array.isArray(result.value) ? result.value : (result || []);
            if (candidates.length) {
                await fetch(`/odata/v4/loan-application/LoanApplications(${newApp.ID})`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ assignedOfficer_ID: candidates[0].officerID })
                });
            }
        } catch (e) {
            console.warn("Auto-assignment failed, application created without an officer:", e.message);
        }

        // Placeholder credit check + risk assessment — real values pending downstream processing
        await fetch("/odata/v4/loan-application/CreditChecks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                application_ID: newApp.ID,
                score: null,
                grade: null,
                status: "PENDING",
                checkedAt: null,
                validityDays: null
            })
        });

        await fetch("/odata/v4/loan-application/RiskAssessments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                application_ID: newApp.ID,
                riskBand: "PENDING",
                riskScore: null,
                collateralCoverage: null,
                rationale: "Risk assessment not yet performed."
            })
        });

        MessageToast.show(`Application ${appNumber} created`);
        this.getOwnerComponent().getRouter().navTo("ApplicationDetail", { key: newApp.ID });
    } catch (e) {
        MessageToast.show(`Error: ${e.message}`);
    }
},

        _generateApplicationNumber: async function () {
            const res = await fetch("/odata/v4/loan-application/LoanApplications?$select=applicationNumber", { headers: { "Accept": "application/json" } });
            const data = await res.json();
            const nums = data.value
                .map(a => parseInt((a.applicationNumber || "").replace("LA-", ""), 10))
                .filter(n => !isNaN(n));
            const next = (nums.length ? Math.max(...nums) : 10000) + 1;
            return `LA-${next}`;
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