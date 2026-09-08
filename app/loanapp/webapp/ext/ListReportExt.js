sap.ui.define([
    "sap/ui/core/mvc/ControllerExtension",
    "sap/ui/model/Filter",
    "sap/ui/model/FilterOperator"
], function (ControllerExtension, Filter, FilterOperator) {
    "use strict";

    return ControllerExtension.extend("loan.cockpit.loanapp.ext.ListReportExt", {
        override: {
            onBeforeRebindTable: function (oEvent, oBindingParams) {
                console.log("onBeforeRebindTable fired", oEvent, oBindingParams);

                if (!oBindingParams) {
                    console.warn("No bindingParams received");
                    return;
                }

                const sHash = window.location.hash;
                const oUrlParams = new URLSearchParams(sHash.split("?")[1] || "");

                const sStatus = oUrlParams.get("status");
                if (sStatus) {
                    oBindingParams.filters.push(new Filter({
                        path: "status",
                        operator: FilterOperator.EQ,
                        value1: sStatus
                    }));
                }

                if (oUrlParams.get("slaBreached") === "true") {
                    const sNowIso = new Date().toISOString();
                    oBindingParams.filters.push(new Filter({
                        path: "slas",
                        operator: FilterOperator.Any,
                        variable: "s",
                        condition: new Filter({
                            path: "s/dueAt",
                            operator: FilterOperator.LE,
                            value1: sNowIso
                        })
                    }));
                }
            }
        }
    });
});