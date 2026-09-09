sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel"
], function (Controller, JSONModel) {
    "use strict";

    return Controller.extend("loan.cockpit.loanapp.controller.Dashboard", {
        onInit: function () {
            this.getOwnerComponent().getRouter()
                .getRoute("Dashboard")
                .attachPatternMatched(this._onDashboardMatched, this);
        },

        _onDashboardMatched: function () {
            this._loadKPIs();
        },

        _loadKPIs: async function () {
            try {
                const res = await fetch("/odata/v4/loan-application/getDashboardKPIs()", {
                    headers: { "Accept": "application/json" }
                });
                const data = await res.json();

                // Donut: top 3 statuses + "Others" bucket, with percentages
                const total = data.totalApplications || 1;
                const sorted = [...data.byStatus].sort((a, b) => b.count - a.count);
                const top3 = sorted.slice(0, 3);
                const othersCount = sorted.slice(3).reduce((sum, s) => sum + s.count, 0);
                const colorClasses = ["donutDotBlue", "donutDotTeal", "donutDotPurple"];
                data.byStatusChart = top3.map((s, i) => ({
                    label: this._statusLabel(s.status),
                    count: s.count,
                    pct: Math.round((s.count / total) * 1000) / 10,
                    colorClass: colorClasses[i]
                }));
                if (othersCount > 0) {
                    data.byStatusChart.push({
                        label: "Others", count: othersCount,
                        pct: Math.round((othersCount / total) * 1000) / 10,
                        colorClass: "donutDotGray"
                    });
                }

                // Severity chart: zero-fill Minor/Low so all 4 always show
                const sevMap = Object.fromEntries(data.openExceptionsBySeverity.map(s => [s.severity, s.count]));
                data.severityChart = ["Critical", "Major", "Minor", "Low"].map(sev => ({
                    severity: sev, count: sevMap[sev] || 0
                }));

                // Trend: short date labels (e.g. "Sep 02")
                data.submissionTrend = data.submissionTrend.map(t => ({
                    ...t,
                    shortDate: new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "2-digit" })
                }));

                this.getView().setModel(new JSONModel(data), "dashboard");
                this._setGreetingModel();
            } catch (e) {
                console.error("Failed to load dashboard KPIs:", e);
            }
        },

        _statusLabel: function (status) {
            const map = {
                SUBMITTED: "Submitted", EXCEPTION: "Exception",
                READY_FOR_REVIEW: "Ready for Review", DRAFT: "Draft",
                APPROVED: "Approved", REJECTED: "Rejected"
            };
            return map[status] || status;
        },

        _setGreetingModel: function () {
            const hour = new Date().getHours();
            const dayPart = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
            const fullName = sap.ushell?.Container?.getUser?.().getFullName?.() || "Ishwarya Chellappan";
            const firstName = fullName.split(" ")[0];
            const initials = fullName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
            const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

            this.getView().setModel(new JSONModel({
                firstName, initials, dayPart, todayLabel,
                name: fullName, role: "Operations Manager"
            }), "user");
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("LoanApplicationsList");
        },

        onNavToList: function () {
            this.getOwnerComponent().getRouter().navTo("LoanApplicationsList");
        },
        onNavFilteredBreached: function () {
            this.getOwnerComponent().getRouter().navTo("FilteredList", { filterType: "slaBreached", filterValue: "true" });
        },
        onNavFilteredException: function () {
            this.getOwnerComponent().getRouter().navTo("FilteredList", { filterType: "exception", filterValue: "true" });
        },

        onStatusBarPress: function (oEvent) {
            const sStatus = oEvent.getParameter("bar").getLabel();
            this.getOwnerComponent().getRouter().navTo("FilteredList", { filterType: "status", filterValue: sStatus });
        },

        onStatusRowPress: function (oEvent) {
            const sStatus = oEvent.getSource().getTitle();
            this.getOwnerComponent().getRouter().navTo("FilteredList", { filterType: "status", filterValue: sStatus });
        },

        onSeverityRowPress: function (oEvent) {
            const sSeverity = oEvent.getSource().getTitle();
            this.getOwnerComponent().getRouter().navTo("FilteredList", { filterType: "severity", filterValue: sSeverity });
        },

        _navWithFilter: function (oFilters) {
            this.getOwnerComponent().getRouter().navTo("LoanApplicationsList", {
                "?query": oFilters
            });
        },
        onAfterRendering: function () {
            if (this._kpiClicksWired) return;
            this._kpiClicksWired = true;
            this.byId("kpiSlaBreached").attachBrowserEvent("click", this.onNavFilteredBreached, this);
            this.byId("kpiOpenExceptions").attachBrowserEvent("click", this.onNavFilteredException, this);
            this.byId("kpiTotalApps").attachBrowserEvent("click", this.onNavToList, this);
            this.byId("sidebarNavApplications").attachBrowserEvent("click", this.onNavToList, this);
            this.byId("sidebarNavExceptions").attachBrowserEvent("click", this.onNavFilteredException, this);
        },

        formatCycleDays: function (v) {
            return (v === null || v === undefined ? 0 : v) + " days";
        },


        onPriorityAppPress: function (oEvent) {
            const oCtx = oEvent.getSource().getBindingContext("dashboard");
            const sID = oCtx.getProperty("ID");
            this.getOwnerComponent().getRouter().navTo("LoanApplicationsObjectPage", { key: sID });
        },

        formatTrendIcon: function (v) {
            if (v === null || v === undefined) return "";
            if (v > 0) return "sap-icon://arrow-top";
            if (v < 0) return "sap-icon://arrow-bottom";
            return "";
        },

        formatTrendText: function (v) {
            if (v === null || v === undefined) return "—";
            const sign = v > 0 ? "+" : "";
            return `${sign}${v}% vs last week`;
        },

        formatTrendClassHigherGood: function (v) {
            if (v === null || v === undefined) return "trendNeutral";
            if (v > 0) return "trendGood";
            if (v < 0) return "trendBad";
            return "trendNeutral";
        },

        formatTrendClassLowerGood: function (v) {
            if (v === null || v === undefined) return "trendNeutral";
            if (v > 0) return "trendBad";
            if (v < 0) return "trendGood";
            return "trendNeutral";
        },

        onPriorityAppPress: function (oEvent) {
            const oCtx = oEvent.getSource().getBindingContext("dashboard");
            const sID = oCtx.getProperty("ID");
            this.getOwnerComponent().getRouter().navTo("LoanApplicationsObjectPage", { key: sID });
        }

    });
});