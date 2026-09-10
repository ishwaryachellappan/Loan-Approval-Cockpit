sap.ui.define([], function () {
    "use strict";

    const NAV_MAP = {
    Dashboard: { id: "sidebarNavDashboard", route: "Dashboard" },
    Applications: { id: "sidebarNavApplications", route: "ApplicationsHome" },
    Exceptions: { id: "sidebarNavExceptions", route: "ExceptionsHome" },
    Queues: { id: "sidebarNavQueues", route: "QueuesHome" },
    Reports: { id: "sidebarNavReports", route: "ReportsHome" }
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
        }
    };
});