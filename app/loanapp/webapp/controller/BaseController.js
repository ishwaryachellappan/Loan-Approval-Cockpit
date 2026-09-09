sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("loan.cockpit.loanapp.controller.BaseController", {
        wireSidebarNav: function () {
            if (this._sidebarWired) return;
            this._sidebarWired = true;
            const oRouter = this.getOwnerComponent().getRouter();
            this.byId("sidebarNavDashboard")?.attachBrowserEvent("click", () => oRouter.navTo("Dashboard"));
            this.byId("sidebarNavApplications")?.attachBrowserEvent("click", () => oRouter.navTo("ApplicationsHome"));
            this.byId("sidebarNavExceptions")?.attachBrowserEvent("click", () => oRouter.navTo("FilteredList", { filterType: "exception", filterValue: "true" }));
        }
    });
});