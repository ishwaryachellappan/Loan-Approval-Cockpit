namespace loan.cockpit;

using {
    cuid,
    managed
} from '@sap/cds/common';

entity Applicants : cuid, managed {
    firstName   : String(100) not null;
    lastName    : String(100) not null;
    email       : String(200);
    phone       : String(30);
    dateOfBirth : Date;
}

entity LoanProducts : cuid, managed {
    productCode     : String(30) not null;
    productName     : String(100) not null;
    category        : String(50); // HOME_LOAN, AUTO_LOAN, PERSONAL_LOAN — matches Officers.expertise
    minAmount       : Decimal(15, 2);
    maxAmount       : Decimal(15, 2);
    minTenureMonths : Integer;
    maxTenureMonths : Integer;
    active          : Boolean default true;
}

entity LoanApplications : cuid, managed {
    applicationNumber : String(30) not null;
    applicant         : Association to Applicants;
    product           : Association to LoanProducts;
    requestedAmount   : Decimal(15, 2) not null;
    tenureMonths      : Integer not null;
    status            : String(30) default 'DRAFT';
    submittedAt       : Timestamp;

    documents         : Composition of many Documents
                            on documents.application = $self;
    creditChecks      : Composition of many CreditChecks
                            on creditChecks.application = $self;
    riskAssessments   : Composition of many RiskAssessments
                            on riskAssessments.application = $self;
    exceptions        : Composition of many Exceptions
                            on exceptions.application = $self;
    slas              : Composition of many SLAs
                            on slas.application = $self;
    approvalSteps     : Composition of many ApprovalSteps
                            on approvalSteps.application = $self;
    auditLogs         : Composition of many AuditLogs
                            on auditLogs.application = $self;

    assignedOfficer   : Association to Officers;
}

entity Documents : cuid, managed {
    application : Association to LoanApplications;
    docType     : String(50);
    status      : String(20); // PENDING, VERIFIED, EXPIRED, REJECTED
    expiryDate  : Date;
    fileName    : String(255);
    mediaType   : String(100);
    content     : LargeBinary;
}

entity CreditChecks : cuid, managed {
    application  : Association to LoanApplications;
    score        : Integer;
    grade        : String(10);
    checkedAt    : Timestamp;
    validityDays : Integer;
    status       : String(20); // AVAILABLE, STALE, MISMATCH
}

entity RiskAssessments : cuid, managed {
    application        : Association to LoanApplications;
    riskBand           : String(20);
    riskScore          : Integer;
    collateralCoverage : Decimal(5, 2);
    rationale          : String(1000);
}

entity Rules : cuid, managed {
    code        : String(30);
    layer       : String(10);
    description : String(500);
    severity    : String(20);
    active      : Boolean default true;
}

entity Exceptions : cuid, managed {
    application     : Association to LoanApplications;
    rule            : Association to Rules;
    reasonCode      : String(30);
    severity        : String(20);
    status          : String(20) default 'OPEN';
    description     : String(500);
    suggestedAction : String(500);
    resolvedAt      : Timestamp;
}

entity SLAs : cuid, managed {
    application : Association to LoanApplications;
    dueAt       : Timestamp;
}

entity ApprovalSteps : cuid, managed {
    application : Association to LoanApplications;
    approver    : String(100);
    level       : Integer;
    decision    : String(20); // APPROVED, REJECTED, ESCALATED
    decidedAt   : Timestamp;
    comments    : String(500);
}

entity AuditLogs : cuid, managed {
    application : Association to LoanApplications;
    eventType   : String(50);
    actor       : String(100);
    beforeValue : String(500);
    afterValue  : String(500);
    reason      : String(500);
}

entity Officers : cuid, managed {
    name               : String(100);
    authorityLevel     : String(20); // e.g. JUNIOR, SENIOR, SENIOR_MANAGER — caps max loan amount they can approve
    maxApprovalAmt     : Decimal(15, 2);
    expertise          : String(50); // e.g. HOME_LOAN, AUTO_LOAN, PERSONAL_LOAN — matches LoanProducts.category
    activeApplications : Association to many LoanApplications
                             on activeApplications.assignedOfficer = $self;
}
