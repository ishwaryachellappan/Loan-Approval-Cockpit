sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "loan/cockpit/loanapp/controller/SidebarHelper"
], function (Controller, JSONModel, SidebarHelper) {
    "use strict";

    const STATUS_META = {
        DRAFT: { label: "New", statusClass: "appsPillGray", badgeClass: "kanbanBadgeNew" },
        SUBMITTED: { label: "Submitted", statusClass: "appsPillBlue", badgeClass: "kanbanBadgeInReview" },
        VALIDATING: { label: "In Review", statusClass: "appsPillOrange", badgeClass: "kanbanBadgeInReview" },
        EXCEPTION: { label: "Exception", statusClass: "appsPillRed", badgeClass: "kanbanBadgePendingInfo" },
        READY_FOR_REVIEW: { label: "Ready", statusClass: "appsPillGreen", badgeClass: "kanbanBadgeReady" },
        UNDERWRITING: { label: "Review", statusClass: "appsPillPurple", badgeClass: "kanbanBadgePendingInfo" },
        APPROVED: { label: "Approved", statusClass: "appsPillGreen", badgeClass: "kanbanBadgeApproved" },
        REJECTED: { label: "Rejected", statusClass: "appsPillGray", badgeClass: "kanbanBadgeRejected" },
        ESCALATED: { label: "Escalated", statusClass: "appsPillGray", badgeClass: "kanbanBadgeEscalated" }
    };

    const COLUMN_ORDER = ["New", "Submitted", "In Review", "Exception", "Ready", "Review", "Approved", "Rejected", "Escalated"];

    return Controller.extend("loan.cockpit.loanapp.controller.Applications", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                viewMode: "table",
                searchTerm: "",
                filterStatus: "ALL",
                filterRisk: "ALL",
                filterProduct: "ALL",
                rows: [],
                filteredRows: [],
                kpi: { total: 0, ready: 0, exceptions: 0, submitted: 0, totalTrend: null }
            }), "apps");
            this._setGreetingModel();
            this._loadApplications();
            this.getOwnerComponent().getRouter().getRoute("ApplicationsHome")
                .attachPatternMatched(this._onRouteMatched, this);
                
        },

       _onRouteMatched: function (oEvent) {
    const oQuery = (oEvent.getParameter("arguments") || {})["?query"] || {};
    if (oQuery.search) {
        this.getView().getModel("apps").setProperty("/searchTerm", oQuery.search);
    }
    this._loadApplications();
},

        _setGreetingModel: function () {
            const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
            this.getView().setModel(new JSONModel({
                initials: "IC", name: "Ishwarya Chellappan", role: "Operations Manager", todayLabel
            }), "user");
        },

        _loadApplications: async function () {
            try {
                const [appsRes, kpiRes] = await Promise.all([
                    fetch("/odata/v4/loan-application/LoanApplications?$expand=applicant,product,riskAssessments,exceptions", { headers: { "Accept": "application/json" } }),
                    fetch("/odata/v4/loan-application/getDashboardKPIs()", { headers: { "Accept": "application/json" } })
                ]);
                const appsData = await appsRes.json();
                const kpiData = await kpiRes.json();

                const rows = appsData.value.map(app => this._shapeRow(app));
                const model = this.getView().getModel("apps");
                model.setProperty("/rows", rows);

                const byLabel = {};
                rows.forEach(r => { byLabel[r.statusLabel] = (byLabel[r.statusLabel] || 0) + 1; });
                model.setProperty("/kpi", {
                    total: kpiData.totalApplications,
                    ready: byLabel["Ready"] || 0,
                    exceptions: kpiData.openExceptionsCount,
                    submitted: byLabel["Submitted"] || 0,
                    totalTrend: kpiData.totalApplicationsTrend
                });

                this._applyFilter();
            } catch (e) {
                console.error("Failed to load applications:", e);
            }
        },

        _shapeRow: function (app) {
            const meta = STATUS_META[app.status] || { label: "Other", statusClass: "appsPillGray", badgeClass: "kanbanBadgeGray" };
            const risk = (app.riskAssessments && app.riskAssessments[0]) || null;
            const openExceptions = (app.exceptions || []).filter(e => e.status === "OPEN");

            let priorityLabel = "Low", priorityClass = "appsPillBlue";
            if (app.priorityScore >= 100) { priorityLabel = "High"; priorityClass = "appsPillRed"; }
            else if (app.priorityScore >= 50) { priorityLabel = "Medium"; priorityClass = "appsPillOrange"; }

            let riskClass = "appsPillGreen";
            if (risk?.riskBand === "HIGH" || risk?.riskBand === "CRITICAL") riskClass = "appsPillRed";
            else if (risk?.riskBand === "MEDIUM") riskClass = "appsPillOrange";

            return {
                ID: app.ID,
                applicationNumber: app.applicationNumber,
                applicantName: app.applicant ? `${app.applicant.firstName} ${app.applicant.lastName}` : null,
                productName: app.product ? app.product.productName : "—",
                requestedAmount: app.requestedAmount,
                tenureMonths: app.tenureMonths,
                riskLevel: risk ? risk.riskBand : null,
                riskClass,
                statusLabel: meta.label,
                statusClass: meta.statusClass,
                priorityLabel, priorityClass,
                badgeClass: meta.badgeClass,
                issueText: openExceptions.length ? (openExceptions[0].description || openExceptions[0].reasonCode) : ""
            };
        },

        onSearchChange: function () { this._applyFilter(); },
        onFilterChange: function () { this._applyFilter(); },

        onFilterReset: function () {
            const model = this.getView().getModel("apps");
            model.setProperty("/searchTerm", "");
            model.setProperty("/filterStatus", "ALL");
            model.setProperty("/filterRisk", "ALL");
            model.setProperty("/filterProduct", "ALL");
            this._applyFilter();
        },

        _applyFilter: function () {
            const model = this.getView().getModel("apps");
            const term = (model.getProperty("/searchTerm") || "").toLowerCase();
            const status = model.getProperty("/filterStatus");
            const risk = model.getProperty("/filterRisk");
            const product = model.getProperty("/filterProduct");
            const rows = model.getProperty("/rows");

            const filtered = rows.filter(r => {
                if (term && !(
                    (r.applicationNumber || "").toLowerCase().includes(term) ||
                    (r.applicantName || "").toLowerCase().includes(term) ||
                    (r.productName || "").toLowerCase().includes(term)
                )) return false;
                if (status !== "ALL" && r.statusLabel !== status) return false;
                if (risk !== "ALL" && r.riskLevel !== risk) return false;
                if (product !== "ALL" && r.productName !== product) return false;
                return true;
            });


            model.setProperty("/filteredRows", filtered);

            this._buildColumns(filtered);
            console.log("columns:", JSON.stringify(columns, null, 2));

        },

        onCardPress: function (oEvent) {
            const oCtx = oEvent.getSource().getBindingContext("apps");
            if (!oCtx) return;
            this.getOwnerComponent().getRouter().navTo("ApplicationDetail", { key: oCtx.getProperty("ID") });
        },

        formatTrendIcon: function (v) {
            if (v === null || v === undefined) return "";
            return v > 0 ? "sap-icon://arrow-top" : v < 0 ? "sap-icon://arrow-bottom" : "";
        },
        formatTrendText: function (v) {
            if (v === null || v === undefined) return "—";
            return `${v > 0 ? "+" : ""}${v}% vs last week`;
        },
        formatTrendClassHigherGood: function (v) {
            if (v === null || v === undefined) return "trendNeutral";
            return v > 0 ? "trendGood" : v < 0 ? "trendBad" : "trendNeutral";
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("Dashboard");
        },

        onAfterRendering: function () {
            if (this._sidebarWired) return;
            this._sidebarWired = true;
            SidebarHelper.wireSidebar(this, "Applications");
             SidebarHelper.wireGlobalSearch(this);
        },

        _loadApplications: async function () {
            try {
                const [appsRes, kpiRes] = await Promise.all([
                    fetch("/odata/v4/loan-application/LoanApplications?$expand=applicant,product,riskAssessments,exceptions", { headers: { "Accept": "application/json" } }),
                    fetch("/odata/v4/loan-application/getDashboardKPIs()", { headers: { "Accept": "application/json" } })
                ]);
                const appsData = await appsRes.json();
                const kpiData = await kpiRes.json();

                const rows = appsData.value.map(app => this._shapeRow(app));
                const model = this.getView().getModel("apps");
                model.setProperty("/rows", rows);

                const byLabel = {};
                rows.forEach(r => { byLabel[r.statusLabel] = (byLabel[r.statusLabel] || 0) + 1; });
                model.setProperty("/kpi", {
                    total: kpiData.totalApplications,
                    ready: byLabel["Ready"] || 0,
                    exceptions: kpiData.openExceptionsCount,
                    submitted: byLabel["Submitted"] || 0,
                    totalTrend: kpiData.totalApplicationsTrend
                });

                this._applyFilter();
            } catch (e) {
                console.error("Failed to load applications:", e);
            }
        },

        _buildColumns: function (rows) {
            const grouped = {};
            rows.forEach(r => { (grouped[r.statusLabel] ||= []).push(r); });
            const columns = COLUMN_ORDER
                .filter(label => grouped[label] && grouped[label].length)
                .map(label => ({
                    label,
                    count: grouped[label].length,
                    badgeClass: grouped[label][0].badgeClass,
                    items: grouped[label]
                }));
            this.getView().getModel("apps").setProperty("/columns", columns);
        },

        onViewModeChange: function (oEvent) {
            this.getView().getModel("apps").setProperty("/viewMode", oEvent.getParameter("item").getKey());
        },

        onNavToCreate: function () {
            this.getOwnerComponent().getRouter().navTo("CreateApplication");
        },

        onSortByApplicationNumber: function () {
    const model = this.getView().getModel("apps");
    const current = model.getProperty("/sortDirection");
    const next = current === "asc" ? "desc" : "asc";

    const rows = model.getProperty("/filteredRows").slice();
    rows.sort((a, b) => {
        const cmp = (a.applicationNumber || "").localeCompare(b.applicationNumber || "", undefined, { numeric: true });
        return next === "asc" ? cmp : -cmp;
    });

    model.setProperty("/filteredRows", rows);
    model.setProperty("/sortDirection", next);
},


    });
});