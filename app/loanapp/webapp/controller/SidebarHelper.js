sap.ui.define([], function () {
    "use strict";

    const NAV_MAP = {
        Dashboard: { id: "sidebarNavDashboard", route: "Dashboard" },
        Applications: { id: "sidebarNavApplications", route: "ApplicationsHome" },
        Exceptions: { id: "sidebarNavExceptions", route: "ExceptionsHome" },
        Queues: { id: "sidebarNavQueues", route: "QueuesHome" },
        Reports: { id: "sidebarNavReports", route: "ReportsHome" },
        Administration: { id: "sidebarNavAdministration", route: "AdministrationHome" }
    };

    return {
        wireSidebar: function (oController, sActivePage) {
            const oRouter = oController.getOwnerComponent().getRouter();

            Object.keys(NAV_MAP).forEach(function (sKey) {
                const oEntry = NAV_MAP[sKey];
                const oControl = oController.byId(oEntry.id);
                if (!oControl) {
                    console.warn("SidebarHelper: control '" + oEntry.id + "' not found");
                    return;
                }
                if (sKey === sActivePage) {
                    oControl.addStyleClass("sidebarNavItemActive");
                } else {
                    oControl.attachBrowserEvent("click", function () {
                        oRouter.navTo(oEntry.route, oEntry.params || {});
                    });
                }
            });

            const oHelpControl = oController.byId("sidebarNavHelp");
            if (oHelpControl) {
                oHelpControl.attachBrowserEvent("click", function () {
                    sap.m.MessageBox.information(
                        "Loan Operations Cockpit\n\n" +
                        "Navigate the pipeline: Dashboard for KPIs and trends, Applications to review and create loans, " +
                        "Exceptions to see what's blocking approvals, Queues to see officer workload, " +
                        "Reports for analytics, Administration to manage officers/products.\n\n" +
                        "For issues, contact your system administrator.",
                        { title: "Help" }
                    );
                });
            } else {
                console.warn("SidebarHelper: control 'sidebarNavHelp' not found");
            }
        },

         wireGlobalSearch: function (oController) {
        const oSearchField = oController.byId("globalSearchField");
        if (!oSearchField) {
            console.warn("SidebarHelper: control 'globalSearchField' not found");
            return;
        }
        oSearchField.attachEvent("search", function (oEvent) {
            const sTerm = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
            if (!sTerm.trim()) return;
            oController.getOwnerComponent().getRouter().navTo("ApplicationsHome", {
                "?query": { search: sTerm }
            });
        });
    }
    };
});