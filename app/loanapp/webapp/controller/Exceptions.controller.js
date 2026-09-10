sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "loan/cockpit/loanapp/controller/SidebarHelper"
], function (Controller, JSONModel, SidebarHelper) {
    "use strict";

    return Controller.extend("loan.cockpit.loanapp.controller.Exceptions", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                searchTerm: "",
                filterSeverity: "ALL",
                filterReason: "ALL",
                rows: [],
                filteredRows: [],
                reasonOptions: [{ key: "ALL", text: "All" }],
                kpi: { total: 0, critical: 0, major: 0, appsAffected: 0 }
            }), "exceptions");
            this._setGreetingModel();

            this.getOwnerComponent().getRouter().getRoute("ExceptionsHome")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._loadExceptions();
        },

        _setGreetingModel: function () {
            this.getView().setModel(new JSONModel({ initials: "IC", name: "Ishwarya Chellappan", role: "Operations Manager" }), "user");
        },

        _loadExceptions: async function () {
            try {
                const res = await fetch(
                    "/odata/v4/loan-application/Exceptions?$filter=status eq 'OPEN'&$expand=application($expand=applicant)",
                    { headers: { "Accept": "application/json" } }
                );
                const data = await res.json();

                const sevClass = { Critical: "appsPillRed", Major: "appsPillOrange", Minor: "appsPillGray" };
                const rows = data.value.map(ex => ({
                    ID: ex.ID,
                    applicationId: ex.application_ID,
                    applicationNumber: ex.application ? ex.application.applicationNumber : "—",
                    applicantName: ex.application && ex.application.applicant ? `${ex.application.applicant.firstName} ${ex.application.applicant.lastName}` : null,
                    severity: ex.severity,
                    severityClass: sevClass[ex.severity] || "appsPillGray",
                    reasonCode: ex.reasonCode,
                    description: ex.description,
                    suggestedAction: ex.suggestedAction
                }));

                const uniqueReasons = [...new Set(rows.map(r => r.reasonCode))];
                const reasonOptions = [{ key: "ALL", text: "All" }, ...uniqueReasons.map(r => ({ key: r, text: r }))];

                const model = this.getView().getModel("exceptions");
                model.setProperty("/rows", rows);
                model.setProperty("/reasonOptions", reasonOptions);
                model.setProperty("/kpi", {
                    total: rows.length,
                    critical: rows.filter(r => r.severity === "Critical").length,
                    major: rows.filter(r => r.severity === "Major").length,
                    appsAffected: new Set(rows.map(r => r.applicationId)).size
                });

                this._applyFilter();
            } catch (e) {
                console.error("Failed to load exceptions:", e);
            }
        },

        onSearchChange: function () { this._applyFilter(); },
        onFilterChange: function () { this._applyFilter(); },

        onFilterReset: function () {
            const model = this.getView().getModel("exceptions");
            model.setProperty("/searchTerm", "");
            model.setProperty("/filterSeverity", "ALL");
            model.setProperty("/filterReason", "ALL");
            this._applyFilter();
        },

        _applyFilter: function () {
            const model = this.getView().getModel("exceptions");
            const term = (model.getProperty("/searchTerm") || "").toLowerCase();
            const severity = model.getProperty("/filterSeverity");
            const reason = model.getProperty("/filterReason");
            const rows = model.getProperty("/rows");

            const filtered = rows.filter(r => {
                if (term && !(
                    (r.applicationNumber || "").toLowerCase().includes(term) ||
                    (r.reasonCode || "").toLowerCase().includes(term) ||
                    (r.description || "").toLowerCase().includes(term)
                )) return false;
                if (severity !== "ALL" && r.severity !== severity) return false;
                if (reason !== "ALL" && r.reasonCode !== reason) return false;
                return true;
            });
            model.setProperty("/filteredRows", filtered);
        },

        onRowPress: function (oEvent) {
            const oCtx = oEvent.getSource().getBindingContext("exceptions");
            this.getOwnerComponent().getRouter().navTo("ApplicationDetail", { key: oCtx.getProperty("applicationId") });
        },

        onAfterRendering: function () {
            if (this._sidebarWired) return;
            this._sidebarWired = true;
            SidebarHelper.wireSidebar(this, "Exceptions");
             SidebarHelper.wireGlobalSearch(this);
        }
    });
});