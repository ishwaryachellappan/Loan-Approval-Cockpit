sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "loan/cockpit/loanapp/controller/SidebarHelper"
], function (Controller, JSONModel, SidebarHelper) {
    "use strict";

    const STATUS_META = {
        DRAFT: { label: "New", statusClass: "appsPillGray" },
        SUBMITTED: { label: "Submitted", statusClass: "appsPillBlue" },
        VALIDATING: { label: "In Review", statusClass: "appsPillOrange" },
        EXCEPTION: { label: "Exception", statusClass: "appsPillRed" },
        READY_FOR_REVIEW: { label: "Ready", statusClass: "appsPillGreen" },
        UNDERWRITING: { label: "Review", statusClass: "appsPillPurple" },
        APPROVED: { label: "Approved", statusClass: "appsPillGreen" },
        REJECTED: { label: "Rejected", statusClass: "appsPillGray" },
        ESCALATED: { label: "Escalated", statusClass: "appsPillGray" }
    };
    const OPEN_STATUSES = ["DRAFT", "SUBMITTED", "VALIDATING", "EXCEPTION", "READY_FOR_REVIEW", "UNDERWRITING"];
    const BADGE_COLORS = ["kanbanBadgeBlue", "kanbanBadgeGreen", "kanbanBadgePurple", "kanbanBadgeInReview", "kanbanBadgeNew"];

    return Controller.extend("loan.cockpit.loanapp.controller.Queues", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                columns: [],
                kpi: { total: 0, unassigned: 0, aged: 0, officersWithLoad: 0 }
            }), "queues");
            this._setGreetingModel();

            this.getOwnerComponent().getRouter().getRoute("QueuesHome")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._loadQueues();
        },

        _setGreetingModel: function () {
            this.getView().setModel(new JSONModel({ initials: "IC", name: "Ishwarya Chellappan", role: "Operations Manager" }), "user");
        },

        _loadQueues: async function () {
            try {
                const res = await fetch(
                    "/odata/v4/loan-application/LoanApplications?$expand=applicant,assignedOfficer",
                    { headers: { "Accept": "application/json" } }
                );
                const data = await res.json();
                const now = new Date();

                const openApps = data.value.filter(a => OPEN_STATUSES.includes(a.status));

                const rows = openApps.map(a => {
                    const meta = STATUS_META[a.status] || { label: a.status, statusClass: "appsPillGray" };
                    const ageDays = a.submittedAt ? Math.round((now - new Date(a.submittedAt)) / (1000 * 60 * 60 * 24)) : 0;
                    return {
                        ID: a.ID,
                        applicationNumber: a.applicationNumber,
                        applicantName: a.applicant ? `${a.applicant.firstName} ${a.applicant.lastName}` : "—",
                        requestedAmount: a.requestedAmount,
                        statusLabel: meta.label,
                        statusClass: meta.statusClass,
                        ageDays,
                        officerName: a.assignedOfficer ? a.assignedOfficer.name : "Unassigned"
                    };
                });

                const grouped = {};
                rows.forEach(r => { (grouped[r.officerName] ||= []).push(r); });

                const officerNames = Object.keys(grouped).filter(n => n !== "Unassigned").sort();
                if (grouped["Unassigned"]) officerNames.push("Unassigned");

                const columns = officerNames.map((name, i) => ({
                    label: name,
                    count: grouped[name].length,
                    badgeClass: name === "Unassigned" ? "kanbanBadgeRejected" : BADGE_COLORS[i % BADGE_COLORS.length],
                    items: grouped[name]
                }));

                const model = this.getView().getModel("queues");
                model.setProperty("/columns", columns);
                model.setProperty("/kpi", {
                    total: rows.length,
                    unassigned: (grouped["Unassigned"] || []).length,
                    aged: rows.filter(r => r.ageDays > 5).length,
                    officersWithLoad: officerNames.filter(n => n !== "Unassigned").length
                });
            } catch (e) {
                console.error("Failed to load queues:", e);
            }
        },

        onCardPress: function (oEvent) {
            const oCtx = oEvent.getSource().getBindingContext("queues");
            this.getOwnerComponent().getRouter().navTo("ApplicationDetail", { key: oCtx.getProperty("ID") });
        },

        onAfterRendering: function () {
            if (this._sidebarWired) return;
            this._sidebarWired = true;
            SidebarHelper.wireSidebar(this, "Queues");
             SidebarHelper.wireGlobalSearch(this);
        }
    });
});