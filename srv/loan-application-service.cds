using {loan.cockpit as db} from '../db/schema';

@path: '/loan-application'



type RecommendedOfficer {
    officerID      : UUID;
    name           : String;
    authorityLevel : String;
    expertiseMatch : Boolean;
    openWorkload   : Integer;
    score          : Decimal(5,2);
    rationale      : String;
}

type DashboardKPIs {
    totalApplications        : Integer;
    byStatus                 : array of StatusCount;
    slaBreachedCount         : Integer;
    slaTotalWithSLA          : Integer;
    slaBreachRate            : Decimal(5, 1);
    openExceptionsCount      : Integer;
    openExceptionsBySeverity : array of SeverityCount;
    avgPriorityScore         : Decimal(5, 2);
    byRiskBand               : array of RiskBandCount;
    agedApplicationsCount    : Integer;
    avgApprovalCycleDays     : Decimal(5, 1);
}

type StatusCount {
    status : String;
    count  : Integer;
}

type SeverityCount {
    severity : String;
    count    : Integer;
}

type RiskBandCount {
    riskBand : String;
    count    : Integer;
}


service LoanApplicationService {

    @odata.draft.enabled
    entity Applicants       as projection on db.Applicants;


    entity LoanProducts     as projection on db.LoanProducts;

    entity LoanApplications as
    projection on db.LoanApplications {
        *,
        case
            status
            when 'DRAFT'            then 2
            when 'SUBMITTED'        then 3
            when 'APPROVED'         then 3
            when 'READY_FOR_REVIEW' then 2
            when 'EXCEPTION'        then 1
            else 0
        end as statusCriticality    : Integer,
        0   as priorityScore        : Integer,
        ''  as slaStatus            : String(20),
        0   as slaStatusCriticality : Integer,
        cast(null as Timestamp)   as slaDueAt : Timestamp
    }
    actions {
        action runValidation()            returns Boolean;
        function recommendAssignment()    returns array of RecommendedOfficer;

        @(requires: ['OperationsOfficer','CreditAnalyst','Underwriter','Approver','Admin'])
        action approve(comments: String)  returns Boolean;

        @(requires: ['OperationsOfficer','CreditAnalyst','Underwriter','Approver','Admin'])
        action reject(comments: String)   returns Boolean;

        @(requires: ['OperationsOfficer','Underwriter','Approver','Admin'])
        action escalate(comments: String) returns Boolean;
    };
    entity Documents        as
        projection on db.Documents {
            *,
            case
                status
                when 'EXPIRED'
                     then 1
                when 'REJECTED'
                     then 1
                when 'PENDING'
                     then 2
                when 'VERIFIED'
                     then 3
                else 0
            end as docStatusCriticality : Integer
        };

    entity CreditChecks     as
        projection on db.CreditChecks {
            *,
            case
                status
                when 'STALE'
                     then 2
                when 'MISMATCH'
                     then 1
                when 'AVAILABLE'
                     then 3
                else 0
            end as creditStatusCriticality : Integer
        };

    entity RiskAssessments  as projection on db.RiskAssessments;
    entity Rules            as projection on db.Rules;

    entity Exceptions       as
        projection on db.Exceptions {
            *,
            case
                severity
                when 'Critical'
                     then 1
                when 'Major'
                     then 2
                when 'Minor'
                     then 3
                else 0
            end as severityCriticality : Integer
        };

    entity SLAs             as projection on db.SLAs;

    function getDashboardKPIs() returns DashboardKPIs;

    entity ApprovalSteps    as projection on db.ApprovalSteps;

    entity Officers         as projection on db.Officers;

    

}
