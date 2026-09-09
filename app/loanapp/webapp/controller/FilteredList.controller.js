sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("loan.cockpit.loanapp.controller.FilteredList", {
        onInit: function () {
            this.getOwnerComponent().getRouter()
                .getRoute("FilteredList")
                .attachPatternMatched(this._onMatched, this);
        },
        _onMatched: function (oEvent) {
            const oArgs = oEvent.getParameter("arguments");
            this._loadFiltered(oArgs.filterType, oArgs.filterValue);
        },

        _loadFiltered: async function (sType, sValue) {
            let sFilter = "";
            let sTitle = "Filtered Applications";

            if (sType === "exception") {
                sFilter = "$filter=status eq 'EXCEPTION'";
                sTitle = "Applications with Open Exceptions";
            } else if (sType === "slaBreached") {
                const sNowIso = new Date().toISOString();
                sFilter = `$filter=slas/any(s:s/dueAt le ${sNowIso})`;
                sTitle = "SLA Breached Applications";
            } else if (sType === "status") {
                sFilter = `$filter=status eq '${sValue}'`;
                sTitle = `Applications — ${sValue}`;
            } else if (sType === "severity") {
                sFilter = `$filter=exceptions/any(e:e/severity eq '${sValue}' and e/status eq 'OPEN')`;
                sTitle = `Applications with ${sValue} Exceptions`;
            }

            this.getView().setModel(new JSONModel({ title: sTitle, rows: [] }), "filtered");

            try {
                const res = await fetch(
                    `/odata/v4/loan-application/LoanApplications?${sFilter}&$expand=applicant,product`,
                    { headers: { "Accept": "application/json" } }
                );
                const data = await res.json();
                this.getView().getModel("filtered").setProperty("/rows", data.value);
            } catch (e) {
                console.error("Failed to load filtered applications:", e);
            }
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("Dashboard");
        },

        onRowPress: function (oEvent) {
            const oCtx = oEvent.getSource().getBindingContext("filtered");
            const sID = oCtx.getProperty("ID");
            this.getOwnerComponent().getRouter().navTo("LoanApplicationsObjectPage", { key: sID });
        }
    });
});