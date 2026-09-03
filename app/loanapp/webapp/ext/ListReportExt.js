sap.ui.define([
    "sap/fe/core/ControllerExtension"
], function (ControllerExtension) {
    "use strict";

    return ControllerExtension.extend("loan.cockpit.loanapp.ext.ListReportExt", {
        override: {
            onAfterBinding: function () {
                console.log("ListReportExt onAfterBinding fired");
                const sStored = sessionStorage.getItem("dashboardFilter");
                console.log("Stored filter:", sStored);
                if (!sStored) return;
                sessionStorage.removeItem("dashboardFilter"); // one-time use

                try {
                    const oFilters = JSON.parse(sStored);
                    const oFilterBarAPI = this.base.getExtensionAPI().getFilterBarAPI?.();
                    if (oFilterBarAPI && oFilters.status) {
                        oFilterBarAPI.setFilterValues("status", [{ operator: "EQ", values: [oFilters.status] }]);
                    }
                } catch (e) {
                    console.error("Failed to apply dashboard filter:", e);
                }
            }
        }
    });
});