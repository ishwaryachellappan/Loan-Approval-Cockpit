using LoanApplicationService as service from '../../srv/loan-application-service';

annotate service.LoanApplications with @(
    UI.LineItem                      : [
        {
            $Type: 'UI.DataField',
            Label: 'Application No.',
            Value: applicationNumber
        },
        {
            $Type: 'UI.DataField',
            Label: 'Applicant',
            Value: applicant.firstName
        },
        {
            $Type: 'UI.DataField',
            Label: 'Product',
            Value: product.productName
        },
        {
            $Type: 'UI.DataField',
            Label: 'Requested Amount',
            Value: requestedAmount
        },
        {
            $Type: 'UI.DataField',
            Label: 'Tenure (months)',
            Value: tenureMonths
        },
        {
            $Type      : 'UI.DataFieldWithUrl',
            Label      : 'Status',
            Value      : status,
            Criticality: statusCriticality
        },
        {
            $Type: 'UI.DataField',
            Label: 'Submitted At',
            Value: submittedAt
        },
        {
            $Type: 'UI.DataField',
            Label: 'Priority Score',
            Value: priorityScore
        },
        {
            $Type: 'UI.DataField',
            Label: 'SLA Due',
            Value: slaDueAt
        },
        {
            $Type      : 'UI.DataField',
            Label      : 'SLA Status',
            Value      : slaStatus,
            Criticality: slaStatusCriticality
        },
    ],

    UI.FieldGroup #ApplicationDetails: {
        $Type: 'UI.FieldGroupType',
        Data : [
            {
                $Type: 'UI.DataField',
                Label: 'Application No.',
                Value: applicationNumber
            },
            {
                $Type: 'UI.DataField',
                Label: 'Requested Amount',
                Value: requestedAmount
            },
            {
                $Type: 'UI.DataField',
                Label: 'Tenure (months)',
                Value: tenureMonths
            },
            {
                $Type      : 'UI.DataField',
                Label      : 'Status',
                Value      : status,
                Criticality: statusCriticality
            },
            {
                $Type: 'UI.DataField',
                Label: 'Submitted At',
                Value: submittedAt
            }
        ]
    },

    UI.FieldGroup #ApplicantDetails  : {
        $Type: 'UI.FieldGroupType',
        Data : [
            {
                $Type: 'UI.DataField',
                Label: 'First Name',
                Value: applicant.firstName
            },
            {
                $Type: 'UI.DataField',
                Label: 'Last Name',
                Value: applicant.lastName
            },
            {
                $Type: 'UI.DataField',
                Label: 'Email',
                Value: applicant.email
            },
            {
                $Type: 'UI.DataField',
                Label: 'Phone',
                Value: applicant.phone
            }
        ]
    },

    UI.FieldGroup #ProductDetails    : {
        $Type: 'UI.FieldGroupType',
        Data : [
            {
                $Type: 'UI.DataField',
                Label: 'Product Code',
                Value: product.productCode
            },
            {
                $Type: 'UI.DataField',
                Label: 'Product Name',
                Value: product.productName
            },
            {
                $Type: 'UI.DataField',
                Label: 'Min Amount',
                Value: product.minAmount
            },
            {
                $Type: 'UI.DataField',
                Label: 'Max Amount',
                Value: product.maxAmount
            }
        ]
    },

    UI.Facets                        : [
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'ApplicationFacet',
            Label : 'Loan Application',
            Target: '@UI.FieldGroup#ApplicationDetails'
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'ApplicantFacet',
            Label : 'Applicant',
            Target: '@UI.FieldGroup#ApplicantDetails'
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'ProductFacet',
            Label : 'Product',
            Target: '@UI.FieldGroup#ProductDetails'
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'ExceptionsFacet',
            Label : 'Why Blocked? (Open Exceptions)',
            Target: 'exceptions/@UI.LineItem'
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'DocumentsFacet',
            Label : 'Documents',
            Target: 'documents/@UI.LineItem'
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'CreditChecksFacet',
            Label : 'Credit Check',
            Target: 'creditChecks/@UI.LineItem'
        },
        {
            $Type : 'UI.ReferenceFacet',
            ID    : 'RiskAssessmentsFacet',
            Label : 'Risk Assessment',
            Target: 'riskAssessments/@UI.LineItem'
        }
    ],

    UI.Identification                : [
        {
            $Type : 'UI.DataFieldForAction',
            Action: 'LoanApplicationService.runValidation',
            Label : 'Run Validation'
        }
       
    ],

    UI.SideEffects : {
    TargetProperties: [
        'status',
        'statusCriticality',
        'priorityScore',
        'slaStatus',
        'slaStatusCriticality',
        'slaDueAt'
    ]
}
);

annotate service.Exceptions with @(UI.LineItem: [
    {
        $Type      : 'UI.DataField',
        Label      : 'Severity',
        Value      : severity,
        Criticality: severityCriticality
    },
    {
        $Type: 'UI.DataField',
        Label: 'Reason',
        Value: reasonCode
    },
    {
        $Type: 'UI.DataField',
        Label: 'Description',
        Value: description
    },
    {
        $Type: 'UI.DataField',
        Label: 'Suggested Action',
        Value: suggestedAction
    },
    {
        $Type: 'UI.DataField',
        Label: 'Status',
        Value: status
    }
]);

annotate service.Documents with @(UI.LineItem: [
    {
        $Type: 'UI.DataField',
        Label: 'Type',
        Value: docType
    },
    {
        $Type      : 'UI.DataField',
        Label      : 'Status',
        Value      : status,
        Criticality: docStatusCriticality
    },
    {
        $Type: 'UI.DataField',
        Label: 'Expiry Date',
        Value: expiryDate
    },
    {
        $Type: 'UI.DataField',
        Label: 'File Name',
        Value: fileName
    }
]);

annotate service.CreditChecks with @(UI.LineItem: [
    {
        $Type: 'UI.DataField',
        Label: 'Score',
        Value: score
    },
    {
        $Type: 'UI.DataField',
        Label: 'Grade',
        Value: grade
    },
    {
        $Type      : 'UI.DataField',
        Label      : 'Status',
        Value      : status,
        Criticality: creditStatusCriticality
    },
    {
        $Type: 'UI.DataField',
        Label: 'Checked At',
        Value: checkedAt
    }
]);

annotate service.RiskAssessments with @(UI.LineItem: [
    {
        $Type: 'UI.DataField',
        Label: 'Risk Band',
        Value: riskBand
    },
    {
        $Type: 'UI.DataField',
        Label: 'Risk Score',
        Value: riskScore
    },
    {
        $Type: 'UI.DataField',
        Label: 'Collateral Coverage',
        Value: collateralCoverage
    },
    {
        $Type: 'UI.DataField',
        Label: 'Rationale',
        Value: rationale
    }
]);


annotate service.LoanApplications with @(UI.PresentationVariant: {
    SortOrder     : [{
        Property  : 'priorityScore',
        Descending: true
    }],
    Visualizations: ['@UI.LineItem']
});
