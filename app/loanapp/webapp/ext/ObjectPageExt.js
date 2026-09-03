sap.ui.define([
    "sap/m/MessageToast"
], function (MessageToast) {
    "use strict";

async function _callAction(oController, actionName, label) {
    const oView = oController.getView ? oController.getView() : oController;
    const oContext = oView.getBindingContext();
    if (!oContext) return;

    const sPath = oContext.getPath();
    const oModel = oView.getModel();
    const sActionName = `LoanApplicationService.${actionName}`;

    try {
        const oOperation = oModel.bindContext(`${sPath}/${sActionName}(...)`, oContext);
        oOperation.setParameter("approver", "Ishwarya");
        oOperation.setParameter("comments", `${label} via cockpit`);
        await oOperation.execute();

        MessageToast.show(`${label} successfully`);

        // Correct V4 way to force this specific context to reload fresh data
        await oContext.requestRefresh();
    } catch (e) {
        console.error("Action failed:", e);
        MessageToast.show(`Failed: ${e.message}`);
    }
}

    return {
        onApprove: function (oEvent) {
            const oController = this; // FPMHelper binds `this` to the controller context
            _callAction(oController, "approve", "Approved");
        },
        onReject: function (oEvent) {
            _callAction(this, "reject", "Rejected");
        },
        onEscalate: function (oEvent) {
            _callAction(this, "escalate", "Escalated");
        }
    };
});