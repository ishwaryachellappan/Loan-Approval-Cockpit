sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("loan.cockpit.loanapp.controller.Dashboard", {
        onInit: function () {
            this._loadKPIs();
        },

        _loadKPIs: async function () {
            try {
                const res = await fetch("/odata/v4/loan-application/getDashboardKPIs()", {
                    headers: { "Accept": "application/json" }
                });
                const data = await res.json();
                this.getView().setModel(new JSONModel(data), "dashboard");
            } catch (e) {
                console.error("Failed to load dashboard KPIs:", e);
            }
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("LoanApplicationsList");
        },

        onNavToList: function () {
            this.getOwnerComponent().getRouter().navTo("LoanApplicationsList");
        },

        onNavFilteredBreached: function () {
            this._navWithFilter({ slaStatus: "BREACHED" });
        },

        onNavFilteredException: function () {
            this._navWithFilter({ status: "EXCEPTION" });
        },

        onStatusBarPress: function (oEvent) {
            const sStatus = oEvent.getParameter("bar").getLabel();
            this._navWithFilter({ status: sStatus });
        },

        onSeverityRowPress: function (oEvent) {
            const sSeverity = oEvent.getSource().getTitle();
            // Severity filter lives on Exceptions, not LoanApplications directly —
            // navigate to the list for now; a dedicated Exceptions list view would be needed for a true filter here.
            this.getOwnerComponent().getRouter().navTo("LoanApplicationsList");
        },

        _navWithFilter: function (oFilters) {
            this.getOwnerComponent().getRouter().navTo("LoanApplicationsList", {
                "?query": oFilters
            });
        },

        onAfterRendering: function () {
    this.byId("kpiSlaBreached").attachBrowserEvent("click", this.onNavFilteredBreached, this);
    this.byId("kpiOpenExceptions").attachBrowserEvent("click", this.onNavFilteredException, this);
    this.byId("kpiTotalApps").attachBrowserEvent("click", this.onNavToList, this);
},

formatCycleDays: function (v) {
    return (v === null || v === undefined ? 0 : v) + " days";
},


    });
});