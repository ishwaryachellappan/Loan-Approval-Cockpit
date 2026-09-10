sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "loan/cockpit/loanapp/controller/SidebarHelper"
], function (Controller, JSONModel, SidebarHelper) {
    "use strict";

    return Controller.extend("loan.cockpit.loanapp.controller.Administration", {
        onInit: function () {
            this.getView().setModel(new JSONModel({
                activeTab: "officers",
                officers: [], products: [], rules: [],
                officerDialogTitle: "Add Officer",
                productDialogTitle: "Add Product"
            }), "admin");
            this._setGreetingModel();

            this.getOwnerComponent().getRouter().getRoute("AdministrationHome")
                .attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._loadAdminData();
        },

        _setGreetingModel: function () {
            this.getView().setModel(new JSONModel({ initials: "IC", name: "Ishwarya Chellappan", role: "Operations Manager" }), "user");
        },

        _loadAdminData: async function () {
            try {
                const [officersRes, productsRes, rulesRes] = await Promise.all([
                    fetch("/odata/v4/loan-application/Officers", { headers: { "Accept": "application/json" } }),
                    fetch("/odata/v4/loan-application/LoanProducts", { headers: { "Accept": "application/json" } }),
                    fetch("/odata/v4/loan-application/Rules", { headers: { "Accept": "application/json" } })
                ]);
                const model = this.getView().getModel("admin");
                model.setProperty("/officers", (await officersRes.json()).value);
                model.setProperty("/products", (await productsRes.json()).value);
                model.setProperty("/rules", (await rulesRes.json()).value);
            } catch (e) {
                console.error("Failed to load admin data:", e);
            }
        },

        onTabSelect: function (oEvent) {
            this.getView().getModel("admin").setProperty("/activeTab", oEvent.getParameter("key"));
        },

        // --- Officers ---
        onAddOfficer: function () {
            this.getView().getModel("admin").setProperty("/officerDialogTitle", "Add Officer");
            this.getView().setModel(new JSONModel({ ID: null, name: "", authorityLevel: "JUNIOR", maxApprovalAmt: "", expertise: "PERSONAL_LOAN" }), "officerEdit");
            this.byId("officerDialog").open();
        },

        onEditOfficer: function (oEvent) {
            const oCtx = oEvent.getSource().getBindingContext("admin");
            this.getView().getModel("admin").setProperty("/officerDialogTitle", "Edit Officer");
            this.getView().setModel(new JSONModel({ ...oCtx.getObject() }), "officerEdit");
            this.byId("officerDialog").open();
        },

        onCancelOfficer: function () {
            this.byId("officerDialog").close();
        },

        onSaveOfficer: async function () {
            const data = this.getView().getModel("officerEdit").getData();
            const isNew = !data.ID;
            const url = isNew ? "/odata/v4/loan-application/Officers" : `/odata/v4/loan-application/Officers(${data.ID})`;
            const body = { name: data.name, authorityLevel: data.authorityLevel, maxApprovalAmt: parseFloat(data.maxApprovalAmt), expertise: data.expertise };

            try {
                const res = await fetch(url, {
                    method: isNew ? "POST" : "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                });
                if (!res.ok) throw new Error("Save failed");
                sap.m.MessageToast.show(isNew ? "Officer added" : "Officer updated");
                this.byId("officerDialog").close();
                this._loadAdminData();
            } catch (e) {
                sap.m.MessageToast.show(`Error: ${e.message}`);
            }
        },

        onDeleteOfficer: function (oEvent) {
            const oCtx = oEvent.getSource().getBindingContext("admin");
            const sId = oCtx.getProperty("ID");
            const sName = oCtx.getProperty("name");
            sap.m.MessageBox.confirm(`Delete officer ${sName}? Any applications assigned to them will need reassignment.`, {
                title: "Delete Officer",
                actions: [sap.m.MessageBox.Action.DELETE, sap.m.MessageBox.Action.CANCEL],
                emphasizedAction: sap.m.MessageBox.Action.DELETE,
                onClose: (sAction) => {
                    if (sAction === sap.m.MessageBox.Action.DELETE) {
                        fetch(`/odata/v4/loan-application/Officers(${sId})`, { method: "DELETE" })
                            .then(res => {
                                if (!res.ok) throw new Error("Delete failed");
                                sap.m.MessageToast.show("Officer deleted");
                                this._loadAdminData();
                            })
                            .catch(e => sap.m.MessageToast.show(`Error: ${e.message}`));
                    }
                }
            });
        },

        // --- Products ---
        onAddProduct: function () {
            this.getView().getModel("admin").setProperty("/productDialogTitle", "Add Product");
            this.getView().setModel(new JSONModel({ ID: null, productCode: "", productName: "", category: "PERSONAL_LOAN", minAmount: "", maxAmount: "", minTenureMonths: "", maxTenureMonths: "", active: true }), "productEdit");
            this.byId("productDialog").open();
        },

        onEditProduct: function (oEvent) {
            const oCtx = oEvent.getSource().getBindingContext("admin");
            this.getView().getModel("admin").setProperty("/productDialogTitle", "Edit Product");
            this.getView().setModel(new JSONModel({ ...oCtx.getObject() }), "productEdit");
            this.byId("productDialog").open();
        },

        onCancelProduct: function () {
            this.byId("productDialog").close();
        },

        onSaveProduct: async function () {
            const data = this.getView().getModel("productEdit").getData();
            const isNew = !data.ID;
            const url = isNew ? "/odata/v4/loan-application/LoanProducts" : `/odata/v4/loan-application/LoanProducts(${data.ID})`;
            const body = {
                productCode: data.productCode, productName: data.productName, category: data.category,
                minAmount: parseFloat(data.minAmount), maxAmount: parseFloat(data.maxAmount),
                minTenureMonths: parseInt(data.minTenureMonths, 10), maxTenureMonths: parseInt(data.maxTenureMonths, 10),
                active: !!data.active
            };

            try {
                const res = await fetch(url, {
                    method: isNew ? "POST" : "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body)
                });
                if (!res.ok) throw new Error("Save failed");
                sap.m.MessageToast.show(isNew ? "Product added" : "Product updated");
                this.byId("productDialog").close();
                this._loadAdminData();
            } catch (e) {
                sap.m.MessageToast.show(`Error: ${e.message}`);
            }
        },

        onDeleteProduct: function (oEvent) {
            const oCtx = oEvent.getSource().getBindingContext("admin");
            const sId = oCtx.getProperty("ID");
            const sName = oCtx.getProperty("productName");
            sap.m.MessageBox.confirm(`Delete product "${sName}"? Existing applications using it will keep their data, but the product will no longer be selectable.`, {
                title: "Delete Product",
                actions: [sap.m.MessageBox.Action.DELETE, sap.m.MessageBox.Action.CANCEL],
                emphasizedAction: sap.m.MessageBox.Action.DELETE,
                onClose: (sAction) => {
                    if (sAction === sap.m.MessageBox.Action.DELETE) {
                        fetch(`/odata/v4/loan-application/LoanProducts(${sId})`, { method: "DELETE" })
                            .then(res => {
                                if (!res.ok) throw new Error("Delete failed — product may be referenced by existing applications.");
                                sap.m.MessageToast.show("Product deleted");
                                this._loadAdminData();
                            })
                            .catch(e => sap.m.MessageToast.show(`Error: ${e.message}`));
                    }
                }
            });
        },

        onAfterRendering: function () {
            if (this._sidebarWired) return;
            this._sidebarWired = true;
            SidebarHelper.wireSidebar(this, "Administration");
        }
    });
});