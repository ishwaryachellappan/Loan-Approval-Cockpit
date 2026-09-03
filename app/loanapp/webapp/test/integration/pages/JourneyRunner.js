sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"loan/cockpit/loanapp/test/integration/pages/ApplicantsList.gen",
	"loan/cockpit/loanapp/test/integration/pages/ApplicantsObjectPage.gen"
], function (JourneyRunner, ApplicantsListGenerated, ApplicantsObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('loan/cockpit/loanapp') + '/test/flp.html#app-preview',
        pages: {
			onTheApplicantsListGenerated: ApplicantsListGenerated,
			onTheApplicantsObjectPageGenerated: ApplicantsObjectPageGenerated
        },
        async: true
    });

    return runner;
});

