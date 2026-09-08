sap.ui.define([
    "sap/m/MessageToast"
], function (MessageToast) {
    "use strict";

async function _callAction(oController, actionName, label, params) {
    const oView = oController.getView ? oController.getView() : oController;
    const oContext = oView.getBindingContext();
    if (!oContext) return;

    const sPath = oContext.getPath();
    const oModel = oView.getModel();
    const sActionName = `LoanApplicationService.${actionName}`;

    try {
        const oOperation = oModel.bindContext(`${sPath}/${sActionName}(...)`, oContext);
        if (params) {
            Object.keys(params).forEach(key => oOperation.setParameter(key, params[key]));
        }
        await oOperation.execute();

        MessageToast.show(`${label} successfully`);
        await oContext.requestRefresh();
    } catch (e) {
        console.error("Action failed:", e);
        MessageToast.show(`Failed: ${e.message}`);
    }
}

    return {
        onRunValidation: function (oEvent) {
            _callAction(this, "runValidation", "Validation run");
        },
        onApprove: function (oEvent) {
            _callAction(this, "approve", "Approved", { comments: "Approved via cockpit" });
        },
        onReject: function (oEvent) {
            _callAction(this, "reject", "Rejected", { comments: "Rejected via cockpit" });
        },
        onEscalate: function (oEvent) {
            _callAction(this, "escalate", "Escalated", { comments: "Escalated via cockpit" });
        }
    };
});