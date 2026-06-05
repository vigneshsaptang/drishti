"""
Risk scoring engine — COMPANY INTELLECTUAL PROPERTY.

Contains FACTOR_CATALOG, PURPOSE_PROFILES, confidence tiers, and scoring math.
This is the ONLY file that contains IP-sensitive logic.

Output is opaque: composite score, level, domain levels. No factor IDs,
rationale, weights, or evidence references leave this module.
"""
from __future__ import annotations


FACTOR_CATALOG: dict[str, dict] = {
    "PANDiscrepancy": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 1.5, "ComplianceRisk": 2.0, "CriminalRisk": 0.3,
            "NarcoTerrorNexusRisk": 0.4, "BenamiRisk": 1.6,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 1.0,
            "EmploymentBGVRisk": 1.2, "ReputationalRisk": 0.8,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "MultiplePANSuspicion": {
        "base_severity": 8,
        "domain_weights": {
            "CreditRisk": 1.5, "ComplianceRisk": 2.0, "CriminalRisk": 0.7,
            "NarcoTerrorNexusRisk": 0.8, "BenamiRisk": 2.2,
            "PoliticalExposureRisk": 0.7, "MatrimonialRisk": 1.5,
            "EmploymentBGVRisk": 1.2, "ReputationalRisk": 1.0,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "AadhaarUnverified": {
        "base_severity": 4,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 1.5, "CriminalRisk": 0.2,
            "NarcoTerrorNexusRisk": 0.2, "BenamiRisk": 0.8,
            "PoliticalExposureRisk": 0.2, "MatrimonialRisk": 0.4,
            "EmploymentBGVRisk": 0.7, "ReputationalRisk": 0.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "AliasIdentity": {
        "base_severity": 4,
        "domain_weights": {
            "CreditRisk": 0.5, "ComplianceRisk": 0.8, "CriminalRisk": 0.5,
            "NarcoTerrorNexusRisk": 0.6, "BenamiRisk": 1.2,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 1.2,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 0.6,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "UnreportedSecondaryMobile": {
        "base_severity": 3,
        "domain_weights": {
            "CreditRisk": 0.3, "ComplianceRisk": 0.6, "CriminalRisk": 0.3,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 0.5,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.8,
            "EmploymentBGVRisk": 0.5, "ReputationalRisk": 0.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "AddressInconsistency": {
        "base_severity": 3,
        "domain_weights": {
            "CreditRisk": 0.5, "ComplianceRisk": 0.7, "CriminalRisk": 0.2,
            "NarcoTerrorNexusRisk": 0.2, "BenamiRisk": 0.4,
            "PoliticalExposureRisk": 0.1, "MatrimonialRisk": 0.5,
            "EmploymentBGVRisk": 0.6, "ReputationalRisk": 0.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "ActiveCredentialExposure": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 0.3, "ComplianceRisk": 0.5, "CriminalRisk": 0.0,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.0,
            "PoliticalExposureRisk": 0.8, "MatrimonialRisk": 0.2,
            "EmploymentBGVRisk": 1.2, "ReputationalRisk": 0.3,
            "CyberAccountTakeoverRisk": 2.2,
        },
    },
    "PlaintextPasswordExposure": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.2, "ComplianceRisk": 0.3, "CriminalRisk": 0.0,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.0,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 0.2,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 0.3,
            "CyberAccountTakeoverRisk": 1.8,
        },
    },
    "ReusedCredentialAcrossBreaches": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 0.2, "ComplianceRisk": 0.4, "CriminalRisk": 0.0,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.0,
            "PoliticalExposureRisk": 0.7, "MatrimonialRisk": 0.2,
            "EmploymentBGVRisk": 1.0, "ReputationalRisk": 0.3,
            "CyberAccountTakeoverRisk": 2.0,
        },
    },
    "IncomeInconsistency": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 1.8, "ComplianceRisk": 1.5, "CriminalRisk": 0.4,
            "NarcoTerrorNexusRisk": 0.4, "BenamiRisk": 1.5,
            "PoliticalExposureRisk": 0.6, "MatrimonialRisk": 1.5,
            "EmploymentBGVRisk": 1.0, "ReputationalRisk": 0.6,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "ChequeDishonourHistory": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 2.0, "ComplianceRisk": 1.5, "CriminalRisk": 0.8,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.4,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 1.2,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.0,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "PendingCriminalMatter_Violent": {
        "base_severity": 9,
        "domain_weights": {
            "CreditRisk": 1.5, "ComplianceRisk": 1.5, "CriminalRisk": 2.4,
            "NarcoTerrorNexusRisk": 0.8, "BenamiRisk": 0.5,
            "PoliticalExposureRisk": 1.5, "MatrimonialRisk": 2.4,
            "EmploymentBGVRisk": 2.4, "ReputationalRisk": 2.0,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "PendingCriminalMatter_Sexual": {
        "base_severity": 10,
        "domain_weights": {
            "CreditRisk": 1.5, "ComplianceRisk": 1.8, "CriminalRisk": 2.5,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 0.3,
            "PoliticalExposureRisk": 1.8, "MatrimonialRisk": 2.5,
            "EmploymentBGVRisk": 2.5, "ReputationalRisk": 2.5,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "PendingCriminalMatter_General": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 1.0, "ComplianceRisk": 1.2, "CriminalRisk": 2.0,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 0.5,
            "PoliticalExposureRisk": 1.2, "MatrimonialRisk": 1.8,
            "EmploymentBGVRisk": 1.8, "ReputationalRisk": 1.5,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "DisposedCriminalMatter": {
        "base_severity": 4,
        "domain_weights": {
            "CreditRisk": 0.4, "ComplianceRisk": 0.5, "CriminalRisk": 1.0,
            "NarcoTerrorNexusRisk": 0.2, "BenamiRisk": 0.2,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 0.8,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 0.6,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "MotorVehicleMatter_Disposed": {
        "base_severity": 2,
        "domain_weights": {
            "CreditRisk": 0.1, "ComplianceRisk": 0.1, "CriminalRisk": 0.3,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.0,
            "PoliticalExposureRisk": 0.1, "MatrimonialRisk": 0.3,
            "EmploymentBGVRisk": 0.3, "ReputationalRisk": 0.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "NDPSMatter_Pending": {
        "base_severity": 10,
        "domain_weights": {
            "CreditRisk": 1.5, "ComplianceRisk": 2.0, "CriminalRisk": 2.4,
            "NarcoTerrorNexusRisk": 2.5, "BenamiRisk": 1.0,
            "PoliticalExposureRisk": 2.0, "MatrimonialRisk": 2.5,
            "EmploymentBGVRisk": 2.4, "ReputationalRisk": 2.4,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "UAPAMatter": {
        "base_severity": 10,
        "domain_weights": {
            "CreditRisk": 2.0, "ComplianceRisk": 2.5, "CriminalRisk": 2.5,
            "NarcoTerrorNexusRisk": 2.5, "BenamiRisk": 1.5,
            "PoliticalExposureRisk": 2.5, "MatrimonialRisk": 2.5,
            "EmploymentBGVRisk": 2.5, "ReputationalRisk": 2.5,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "PMLAMatter_Pending": {
        "base_severity": 9,
        "domain_weights": {
            "CreditRisk": 2.0, "ComplianceRisk": 2.5, "CriminalRisk": 1.5,
            "NarcoTerrorNexusRisk": 1.5, "BenamiRisk": 2.0,
            "PoliticalExposureRisk": 1.8, "MatrimonialRisk": 2.0,
            "EmploymentBGVRisk": 2.0, "ReputationalRisk": 2.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "CorruptionMatter": {
        "base_severity": 8,
        "domain_weights": {
            "CreditRisk": 1.5, "ComplianceRisk": 2.2, "CriminalRisk": 1.8,
            "NarcoTerrorNexusRisk": 0.6, "BenamiRisk": 1.5,
            "PoliticalExposureRisk": 2.0, "MatrimonialRisk": 1.8,
            "EmploymentBGVRisk": 2.0, "ReputationalRisk": 2.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "DomesticViolenceMatter": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 0.4, "ComplianceRisk": 0.5, "CriminalRisk": 1.5,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.0,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 2.4,
            "EmploymentBGVRisk": 1.0, "ReputationalRisk": 1.5,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "ActiveCivilDispute": {
        "base_severity": 4,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 0.6, "CriminalRisk": 0.2,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.3,
            "PoliticalExposureRisk": 0.4, "MatrimonialRisk": 0.8,
            "EmploymentBGVRisk": 0.4, "ReputationalRisk": 0.6,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "ActiveLitigationAsRespondent": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 1.0, "CriminalRisk": 0.5,
            "NarcoTerrorNexusRisk": 0.1, "BenamiRisk": 0.4,
            "PoliticalExposureRisk": 0.4, "MatrimonialRisk": 0.6,
            "EmploymentBGVRisk": 1.0, "ReputationalRisk": 1.4,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "HCStayedProceedings": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 0.6, "ComplianceRisk": 1.2, "CriminalRisk": 1.4,
            "NarcoTerrorNexusRisk": 0.3, "BenamiRisk": 0.4,
            "PoliticalExposureRisk": 0.4, "MatrimonialRisk": 0.7,
            "EmploymentBGVRisk": 1.3, "ReputationalRisk": 1.4,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "PEPStatus": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 1.8, "CriminalRisk": 0.3,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 1.2,
            "PoliticalExposureRisk": 2.5, "MatrimonialRisk": 1.0,
            "EmploymentBGVRisk": 1.0, "ReputationalRisk": 1.0,
            "CyberAccountTakeoverRisk": 0.5,
        },
    },
    "GlobalAdverseScreeningStatus": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.5, "ComplianceRisk": 1.5, "CriminalRisk": 0.2,
            "NarcoTerrorNexusRisk": 0.4, "BenamiRisk": 1.0,
            "PoliticalExposureRisk": 2.0, "MatrimonialRisk": 0.8,
            "EmploymentBGVRisk": 1.2, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 0.6,
        },
    },
    "SanctionsMatch": {
        "base_severity": 10,
        "domain_weights": {
            "CreditRisk": 2.5, "ComplianceRisk": 2.5, "CriminalRisk": 2.0,
            "NarcoTerrorNexusRisk": 2.5, "BenamiRisk": 2.0,
            "PoliticalExposureRisk": 2.5, "MatrimonialRisk": 2.0,
            "EmploymentBGVRisk": 2.5, "ReputationalRisk": 2.5,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "ConflictOfInterest": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 0.4, "ComplianceRisk": 1.5, "CriminalRisk": 0.4,
            "NarcoTerrorNexusRisk": 0.2, "BenamiRisk": 1.0,
            "PoliticalExposureRisk": 1.8, "MatrimonialRisk": 0.4,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "UndisclosedExistingMarriage": {
        "base_severity": 10,
        "domain_weights": {
            "CreditRisk": 0.2, "ComplianceRisk": 0.5, "CriminalRisk": 1.5,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.5,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 2.5,
            "EmploymentBGVRisk": 0.5, "ReputationalRisk": 2.0,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "DowryHarassmentMatter": {
        "base_severity": 9,
        "domain_weights": {
            "CreditRisk": 0.3, "ComplianceRisk": 0.5, "CriminalRisk": 1.8,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.0,
            "PoliticalExposureRisk": 0.4, "MatrimonialRisk": 2.5,
            "EmploymentBGVRisk": 1.0, "ReputationalRisk": 1.8,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "AdverseCharacterSignal": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.2, "ComplianceRisk": 0.3, "CriminalRisk": 0.4,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.0,
            "PoliticalExposureRisk": 0.4, "MatrimonialRisk": 1.5,
            "EmploymentBGVRisk": 0.6, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "AdverseMediaHit": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.4, "ComplianceRisk": 0.6, "CriminalRisk": 0.6,
            "NarcoTerrorNexusRisk": 0.3, "BenamiRisk": 0.4,
            "PoliticalExposureRisk": 0.8, "MatrimonialRisk": 1.0,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 2.0,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "IdentityCorroborated": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": -1.0, "ComplianceRisk": -1.5, "CriminalRisk": -0.5,
            "NarcoTerrorNexusRisk": -0.5, "BenamiRisk": -0.8,
            "PoliticalExposureRisk": -0.5, "MatrimonialRisk": -0.8,
            "EmploymentBGVRisk": -1.0, "ReputationalRisk": -0.5,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "EmployerVerified": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": -1.0, "ComplianceRisk": -1.0, "CriminalRisk": -0.5,
            "NarcoTerrorNexusRisk": -0.3, "BenamiRisk": -0.5,
            "PoliticalExposureRisk": -0.5, "MatrimonialRisk": -1.0,
            "EmploymentBGVRisk": -2.0, "ReputationalRisk": -0.5,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "CleanLitigationScreen": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": -0.6, "ComplianceRisk": -0.8, "CriminalRisk": -2.2,
            "NarcoTerrorNexusRisk": -1.5, "BenamiRisk": -0.5,
            "PoliticalExposureRisk": -0.6, "MatrimonialRisk": -1.5,
            "EmploymentBGVRisk": -1.5, "ReputationalRisk": -1.0,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "StableLocationFootprint": {
        "base_severity": 3,
        "domain_weights": {
            "CreditRisk": -0.4, "ComplianceRisk": -0.5, "CriminalRisk": -0.2,
            "NarcoTerrorNexusRisk": -0.3, "BenamiRisk": -0.3,
            "PoliticalExposureRisk": -0.1, "MatrimonialRisk": -0.4,
            "EmploymentBGVRisk": -0.5, "ReputationalRisk": -0.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "FraudLinkedPaymentAccount": {
        "base_severity": 9,
        "domain_weights": {
            "CreditRisk": 2.2, "ComplianceRisk": 2.0, "CriminalRisk": 2.0,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 1.5,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 1.5,
            "EmploymentBGVRisk": 2.0, "ReputationalRisk": 1.8,
            "CyberAccountTakeoverRisk": 0.5,
        },
    },
    "BettingSiteLinkedPayment": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 1.5, "ComplianceRisk": 1.5, "CriminalRisk": 1.0,
            "NarcoTerrorNexusRisk": 0.3, "BenamiRisk": 0.8,
            "PoliticalExposureRisk": 0.4, "MatrimonialRisk": 1.2,
            "EmploymentBGVRisk": 1.5, "ReputationalRisk": 1.5,
            "CyberAccountTakeoverRisk": 0.3,
        },
    },
    "CryptoExchangeLinkedPayment": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 1.2, "CriminalRisk": 0.3,
            "NarcoTerrorNexusRisk": 0.4, "BenamiRisk": 1.0,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.3,
            "EmploymentBGVRisk": 0.5, "ReputationalRisk": 0.5,
            "CyberAccountTakeoverRisk": 0.5,
        },
    },
    "FlaggedBankAccount": {
        "base_severity": 8,
        "domain_weights": {
            "CreditRisk": 2.0, "ComplianceRisk": 2.0, "CriminalRisk": 1.5,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 1.5,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 1.2,
            "EmploymentBGVRisk": 1.8, "ReputationalRisk": 1.5,
            "CyberAccountTakeoverRisk": 0.3,
        },
    },
    "CryptoWalletExposure": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 1.2, "CriminalRisk": 0.5,
            "NarcoTerrorNexusRisk": 0.6, "BenamiRisk": 1.2,
            "PoliticalExposureRisk": 0.4, "MatrimonialRisk": 0.3,
            "EmploymentBGVRisk": 0.6, "ReputationalRisk": 0.6,
            "CyberAccountTakeoverRisk": 0.8,
        },
    },
    "MessagingGroupMention": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.3, "ComplianceRisk": 0.5, "CriminalRisk": 0.5,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 0.3,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.5,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 0.3,
        },
    },
    "MessagingHighExposure": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 0.5, "ComplianceRisk": 0.8, "CriminalRisk": 1.0,
            "NarcoTerrorNexusRisk": 0.8, "BenamiRisk": 0.5,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 0.8,
            "EmploymentBGVRisk": 1.2, "ReputationalRisk": 1.8,
            "CyberAccountTakeoverRisk": 0.5,
        },
    },
    "UndergroundForumAuthor": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 0.5, "ComplianceRisk": 1.0, "CriminalRisk": 1.5,
            "NarcoTerrorNexusRisk": 1.0, "BenamiRisk": 0.5,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 1.0,
            "EmploymentBGVRisk": 1.5, "ReputationalRisk": 1.5,
            "CyberAccountTakeoverRisk": 1.5,
        },
    },
    "UndergroundHighActivity": {
        "base_severity": 8,
        "domain_weights": {
            "CreditRisk": 0.6, "ComplianceRisk": 1.2, "CriminalRisk": 1.8,
            "NarcoTerrorNexusRisk": 1.2, "BenamiRisk": 0.6,
            "PoliticalExposureRisk": 0.6, "MatrimonialRisk": 1.2,
            "EmploymentBGVRisk": 1.8, "ReputationalRisk": 2.0,
            "CyberAccountTakeoverRisk": 2.0,
        },
    },
    "UndergroundRegionalTargeting": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 0.5, "ComplianceRisk": 1.0, "CriminalRisk": 1.2,
            "NarcoTerrorNexusRisk": 1.5, "BenamiRisk": 0.8,
            "PoliticalExposureRisk": 0.6, "MatrimonialRisk": 0.5,
            "EmploymentBGVRisk": 1.0, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 1.2,
        },
    },
    "DrugMarketplaceLinkage": {
        "base_severity": 9,
        "domain_weights": {
            "CreditRisk": 1.5, "ComplianceRisk": 2.0, "CriminalRisk": 2.2,
            "NarcoTerrorNexusRisk": 2.5, "BenamiRisk": 1.0,
            "PoliticalExposureRisk": 1.5, "MatrimonialRisk": 2.0,
            "EmploymentBGVRisk": 2.2, "ReputationalRisk": 2.2,
            "CyberAccountTakeoverRisk": 0.5,
        },
    },
    "MassBreachExposure": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 0.5, "ComplianceRisk": 0.5, "CriminalRisk": 0.0,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.0,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.3,
            "EmploymentBGVRisk": 1.0, "ReputationalRisk": 0.5,
            "CyberAccountTakeoverRisk": 2.0,
        },
    },
    "GovernmentEmailExposure": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 0.3, "ComplianceRisk": 1.5, "CriminalRisk": 0.2,
            "NarcoTerrorNexusRisk": 0.3, "BenamiRisk": 0.3,
            "PoliticalExposureRisk": 1.2, "MatrimonialRisk": 0.3,
            "EmploymentBGVRisk": 1.5, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 1.5,
        },
    },
    "CorporateEmailExposure": {
        "base_severity": 4,
        "domain_weights": {
            "CreditRisk": 0.2, "ComplianceRisk": 0.5, "CriminalRisk": 0.0,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.0,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.2,
            "EmploymentBGVRisk": 1.0, "ReputationalRisk": 0.5,
            "CyberAccountTakeoverRisk": 1.2,
        },
    },
    "BreachRecencyRisk": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.3, "ComplianceRisk": 0.5, "CriminalRisk": 0.0,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.0,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.2,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 0.3,
            "CyberAccountTakeoverRisk": 1.8,
        },
    },
    "PhoneFraudDatabaseFlag": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 1.5, "ComplianceRisk": 1.5, "CriminalRisk": 1.8,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 0.8,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 1.0,
            "EmploymentBGVRisk": 1.8, "ReputationalRisk": 1.5,
            "CyberAccountTakeoverRisk": 1.0,
        },
    },
    "MultiSourceAdverseConvergence": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 1.0, "ComplianceRisk": 1.2, "CriminalRisk": 1.5,
            "NarcoTerrorNexusRisk": 0.8, "BenamiRisk": 0.8,
            "PoliticalExposureRisk": 0.6, "MatrimonialRisk": 1.0,
            "EmploymentBGVRisk": 1.5, "ReputationalRisk": 1.5,
            "CyberAccountTakeoverRisk": 0.5,
        },
    },
    "CleanFinancialScreen": {
        "base_severity": 4,
        "domain_weights": {
            "CreditRisk": -1.5, "ComplianceRisk": -1.0, "CriminalRisk": -0.5,
            "NarcoTerrorNexusRisk": -0.3, "BenamiRisk": -0.8,
            "PoliticalExposureRisk": -0.2, "MatrimonialRisk": -0.4,
            "EmploymentBGVRisk": -0.5, "ReputationalRisk": -0.3,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "CleanUndergroundScreen": {
        "base_severity": 4,
        "domain_weights": {
            "CreditRisk": -0.3, "ComplianceRisk": -0.5, "CriminalRisk": -1.0,
            "NarcoTerrorNexusRisk": -1.0, "BenamiRisk": -0.3,
            "PoliticalExposureRisk": -0.3, "MatrimonialRisk": -0.5,
            "EmploymentBGVRisk": -0.8, "ReputationalRisk": -0.8,
            "CyberAccountTakeoverRisk": -1.0,
        },
    },
    "CleanMessagingScreen": {
        "base_severity": 3,
        "domain_weights": {
            "CreditRisk": -0.2, "ComplianceRisk": -0.3, "CriminalRisk": -0.3,
            "NarcoTerrorNexusRisk": -0.3, "BenamiRisk": -0.2,
            "PoliticalExposureRisk": -0.2, "MatrimonialRisk": -0.3,
            "EmploymentBGVRisk": -0.4, "ReputationalRisk": -0.5,
            "CyberAccountTakeoverRisk": -0.2,
        },
    },
    # ── eCourts litigation factors ─────────────────────────────
    "InsolvencyProceeding": {
        "base_severity": 8,
        "domain_weights": {
            "CreditRisk": 2.2, "ComplianceRisk": 1.8, "CriminalRisk": 0.5,
            "NarcoTerrorNexusRisk": 0.3, "BenamiRisk": 1.5,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 1.0,
            "EmploymentBGVRisk": 1.8, "ReputationalRisk": 1.8,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "FamilyCourtMatter": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.3, "ComplianceRisk": 0.3, "CriminalRisk": 0.3,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.2,
            "PoliticalExposureRisk": 0.2, "MatrimonialRisk": 2.2,
            "EmploymentBGVRisk": 0.5, "ReputationalRisk": 0.8,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "ConsumerComplaint": {
        "base_severity": 3,
        "domain_weights": {
            "CreditRisk": 0.5, "ComplianceRisk": 0.5, "CriminalRisk": 0.1,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.2,
            "PoliticalExposureRisk": 0.1, "MatrimonialRisk": 0.2,
            "EmploymentBGVRisk": 0.3, "ReputationalRisk": 0.8,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "LaborDispute": {
        "base_severity": 4,
        "domain_weights": {
            "CreditRisk": 0.4, "ComplianceRisk": 0.8, "CriminalRisk": 0.2,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.2,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.1,
            "EmploymentBGVRisk": 1.8, "ReputationalRisk": 0.8,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "LandPropertyDispute": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 1.0, "ComplianceRisk": 0.6, "CriminalRisk": 0.3,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 1.5,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.5,
            "EmploymentBGVRisk": 0.4, "ReputationalRisk": 0.6,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "CommercialCourtCase": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 1.5, "ComplianceRisk": 1.2, "CriminalRisk": 0.3,
            "NarcoTerrorNexusRisk": 0.2, "BenamiRisk": 1.0,
            "PoliticalExposureRisk": 0.4, "MatrimonialRisk": 0.2,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "HighCourtLitigation": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 1.2, "CriminalRisk": 0.8,
            "NarcoTerrorNexusRisk": 0.3, "BenamiRisk": 0.5,
            "PoliticalExposureRisk": 0.6, "MatrimonialRisk": 0.5,
            "EmploymentBGVRisk": 1.0, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "DivisionBenchMatter": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 1.5, "CriminalRisk": 1.2,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 0.6,
            "PoliticalExposureRisk": 0.8, "MatrimonialRisk": 0.5,
            "EmploymentBGVRisk": 1.2, "ReputationalRisk": 1.5,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "LongPendingLitigation": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 0.8, "CriminalRisk": 0.5,
            "NarcoTerrorNexusRisk": 0.2, "BenamiRisk": 0.4,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.5,
            "EmploymentBGVRisk": 0.6, "ReputationalRisk": 0.8,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "HighlyContestedCase": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.6, "ComplianceRisk": 0.8, "CriminalRisk": 0.5,
            "NarcoTerrorNexusRisk": 0.2, "BenamiRisk": 0.4,
            "PoliticalExposureRisk": 0.4, "MatrimonialRisk": 0.5,
            "EmploymentBGVRisk": 0.6, "ReputationalRisk": 0.8,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "CriminalRespondent": {
        "base_severity": 8,
        "domain_weights": {
            "CreditRisk": 1.2, "ComplianceRisk": 1.5, "CriminalRisk": 2.2,
            "NarcoTerrorNexusRisk": 0.8, "BenamiRisk": 0.6,
            "PoliticalExposureRisk": 1.2, "MatrimonialRisk": 2.0,
            "EmploymentBGVRisk": 2.2, "ReputationalRisk": 1.8,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "SerialLitigant": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 0.8, "CriminalRisk": 0.5,
            "NarcoTerrorNexusRisk": 0.2, "BenamiRisk": 0.5,
            "PoliticalExposureRisk": 0.4, "MatrimonialRisk": 0.8,
            "EmploymentBGVRisk": 0.6, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "MultiJurisdictionExposure": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.6, "ComplianceRisk": 0.8, "CriminalRisk": 0.5,
            "NarcoTerrorNexusRisk": 0.4, "BenamiRisk": 0.6,
            "PoliticalExposureRisk": 0.4, "MatrimonialRisk": 0.4,
            "EmploymentBGVRisk": 0.5, "ReputationalRisk": 0.8,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "CriminalConviction": {
        "base_severity": 10,
        "domain_weights": {
            "CreditRisk": 2.0, "ComplianceRisk": 2.5, "CriminalRisk": 2.5,
            "NarcoTerrorNexusRisk": 1.5, "BenamiRisk": 1.2,
            "PoliticalExposureRisk": 2.0, "MatrimonialRisk": 2.5,
            "EmploymentBGVRisk": 2.5, "ReputationalRisk": 2.5,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "AdverseCourtOrder": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 1.0, "CriminalRisk": 0.5,
            "NarcoTerrorNexusRisk": 0.2, "BenamiRisk": 0.5,
            "PoliticalExposureRisk": 0.4, "MatrimonialRisk": 0.6,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.0,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "CriminalAcquittal": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": -0.3, "ComplianceRisk": -0.5, "CriminalRisk": -1.5,
            "NarcoTerrorNexusRisk": -0.5, "BenamiRisk": -0.2,
            "PoliticalExposureRisk": -0.3, "MatrimonialRisk": -0.8,
            "EmploymentBGVRisk": -1.0, "ReputationalRisk": -0.8,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "FIRLinkedCase": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 0.5, "ComplianceRisk": 1.0, "CriminalRisk": 1.5,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 0.3,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 1.0,
            "EmploymentBGVRisk": 1.5, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "RecentFilingSpike": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 0.8, "CriminalRisk": 0.6,
            "NarcoTerrorNexusRisk": 0.3, "BenamiRisk": 0.5,
            "PoliticalExposureRisk": 0.4, "MatrimonialRisk": 0.6,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.0,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "NegotiableInstrumentDishonour": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 2.0, "ComplianceRisk": 1.5, "CriminalRisk": 0.8,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.4,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 1.0,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.0,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "CleanCourtRecordsScreen": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": -0.8, "ComplianceRisk": -1.0, "CriminalRisk": -2.0,
            "NarcoTerrorNexusRisk": -1.0, "BenamiRisk": -0.5,
            "PoliticalExposureRisk": -0.5, "MatrimonialRisk": -1.2,
            "EmploymentBGVRisk": -1.5, "ReputationalRisk": -1.0,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    # ── CREDMON deep breach-field factors ──────────────────────
    "GovernmentIDExposure": {
        "base_severity": 8,
        "domain_weights": {
            "CreditRisk": 1.5, "ComplianceRisk": 2.0, "CriminalRisk": 0.8,
            "NarcoTerrorNexusRisk": 0.3, "BenamiRisk": 1.5,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 0.8,
            "EmploymentBGVRisk": 1.5, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 0.8,
        },
    },
    "FinancialDataInBreach": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 2.0, "ComplianceRisk": 1.5, "CriminalRisk": 0.5,
            "NarcoTerrorNexusRisk": 0.3, "BenamiRisk": 1.0,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.5,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 0.8,
            "CyberAccountTakeoverRisk": 1.5,
        },
    },
    "HealthDataExposure": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 0.2, "ComplianceRisk": 1.5, "CriminalRisk": 0.2,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.0,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 1.0,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 0.5,
        },
    },
    "DateOfBirthExposure": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 0.8, "CriminalRisk": 0.3,
            "NarcoTerrorNexusRisk": 0.2, "BenamiRisk": 0.5,
            "PoliticalExposureRisk": 0.2, "MatrimonialRisk": 0.5,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 0.3,
            "CyberAccountTakeoverRisk": 1.0,
        },
    },
    "WeakPasswordPattern": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.2, "ComplianceRisk": 0.3, "CriminalRisk": 0.0,
            "NarcoTerrorNexusRisk": 0.0, "BenamiRisk": 0.0,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.2,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 0.3,
            "CyberAccountTakeoverRisk": 2.0,
        },
    },
    # ── FTI deep screening factors ────────────────────────────
    "CriminalNetworkProximity": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 1.5, "CriminalRisk": 2.0,
            "NarcoTerrorNexusRisk": 1.5, "BenamiRisk": 1.0,
            "PoliticalExposureRisk": 0.8, "MatrimonialRisk": 1.2,
            "EmploymentBGVRisk": 1.5, "ReputationalRisk": 1.5,
            "CyberAccountTakeoverRisk": 0.3,
        },
    },
    "SanctionedEntityNetwork": {
        "base_severity": 8,
        "domain_weights": {
            "CreditRisk": 1.5, "ComplianceRisk": 2.2, "CriminalRisk": 1.5,
            "NarcoTerrorNexusRisk": 2.0, "BenamiRisk": 1.5,
            "PoliticalExposureRisk": 2.0, "MatrimonialRisk": 1.0,
            "EmploymentBGVRisk": 1.8, "ReputationalRisk": 2.0,
            "CyberAccountTakeoverRisk": 0.3,
        },
    },
    "FraudDomainLinkedPayment": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 1.8, "ComplianceRisk": 1.5, "CriminalRisk": 1.5,
            "NarcoTerrorNexusRisk": 0.3, "BenamiRisk": 0.8,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.8,
            "EmploymentBGVRisk": 1.5, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 0.8,
        },
    },
    "HighValueCryptoTransaction": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 1.0, "ComplianceRisk": 1.5, "CriminalRisk": 0.8,
            "NarcoTerrorNexusRisk": 1.0, "BenamiRisk": 1.5,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 0.3,
            "EmploymentBGVRisk": 0.5, "ReputationalRisk": 0.8,
            "CyberAccountTakeoverRisk": 0.5,
        },
    },
    "MultiplePaymentAccountsPerPhone": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 1.0, "ComplianceRisk": 1.0, "CriminalRisk": 0.5,
            "NarcoTerrorNexusRisk": 0.3, "BenamiRisk": 1.2,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.3,
            "EmploymentBGVRisk": 0.5, "ReputationalRisk": 0.5,
            "CyberAccountTakeoverRisk": 0.3,
        },
    },
    # ── DARKMON deep author/activity factors ───────────────────
    "UndergroundVendorStatus": {
        "base_severity": 9,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 1.5, "CriminalRisk": 2.2,
            "NarcoTerrorNexusRisk": 2.0, "BenamiRisk": 0.8,
            "PoliticalExposureRisk": 0.8, "MatrimonialRisk": 1.5,
            "EmploymentBGVRisk": 2.2, "ReputationalRisk": 2.2,
            "CyberAccountTakeoverRisk": 1.8,
        },
    },
    "UndergroundRecentActivity": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 0.4, "ComplianceRisk": 0.8, "CriminalRisk": 1.2,
            "NarcoTerrorNexusRisk": 0.8, "BenamiRisk": 0.4,
            "PoliticalExposureRisk": 0.4, "MatrimonialRisk": 0.8,
            "EmploymentBGVRisk": 1.2, "ReputationalRisk": 1.5,
            "CyberAccountTakeoverRisk": 1.0,
        },
    },
    "UndergroundLongTermPresence": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 0.5, "ComplianceRisk": 1.0, "CriminalRisk": 1.5,
            "NarcoTerrorNexusRisk": 1.2, "BenamiRisk": 0.5,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 1.0,
            "EmploymentBGVRisk": 1.5, "ReputationalRisk": 1.8,
            "CyberAccountTakeoverRisk": 1.5,
        },
    },
    "UndergroundHighInfluence": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 0.3, "ComplianceRisk": 0.8, "CriminalRisk": 1.0,
            "NarcoTerrorNexusRisk": 0.8, "BenamiRisk": 0.3,
            "PoliticalExposureRisk": 0.4, "MatrimonialRisk": 0.6,
            "EmploymentBGVRisk": 1.0, "ReputationalRisk": 1.5,
            "CyberAccountTakeoverRisk": 1.2,
        },
    },
    "UndergroundCryptoWallet": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 1.2, "CriminalRisk": 1.2,
            "NarcoTerrorNexusRisk": 1.0, "BenamiRisk": 1.0,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 0.3,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.0,
            "CyberAccountTakeoverRisk": 1.2,
        },
    },
    "UndergroundCyberThreats": {
        "base_severity": 8,
        "domain_weights": {
            "CreditRisk": 0.5, "ComplianceRisk": 1.2, "CriminalRisk": 1.8,
            "NarcoTerrorNexusRisk": 1.0, "BenamiRisk": 0.3,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 0.8,
            "EmploymentBGVRisk": 1.8, "ReputationalRisk": 1.8,
            "CyberAccountTakeoverRisk": 2.2,
        },
    },
    "UndergroundContactExposure": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.3, "ComplianceRisk": 0.5, "CriminalRisk": 0.8,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 0.2,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.5,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.0,
            "CyberAccountTakeoverRisk": 1.0,
        },
    },
    "UndergroundForumDiversity": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.3, "ComplianceRisk": 0.6, "CriminalRisk": 0.8,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 0.3,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.5,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.0,
            "CyberAccountTakeoverRisk": 0.8,
        },
    },
    # ── MCA corporate factors ─────────────────────────────────
    "CompanyDissolved": {
        "base_severity": 8,
        "domain_weights": {
            "CreditRisk": 2.0, "ComplianceRisk": 1.8, "CriminalRisk": 0.8,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 2.0,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 0.3,
            "EmploymentBGVRisk": 1.5, "ReputationalRisk": 1.5,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "CompanyUnderStrikeOff": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 1.8, "ComplianceRisk": 1.5, "CriminalRisk": 0.6,
            "NarcoTerrorNexusRisk": 0.3, "BenamiRisk": 1.8,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.2,
            "EmploymentBGVRisk": 1.2, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "ShellCompanyIndicators": {
        "base_severity": 9,
        "domain_weights": {
            "CreditRisk": 2.2, "ComplianceRisk": 2.5, "CriminalRisk": 1.5,
            "NarcoTerrorNexusRisk": 1.2, "BenamiRisk": 2.5,
            "PoliticalExposureRisk": 1.0, "MatrimonialRisk": 0.5,
            "EmploymentBGVRisk": 1.0, "ReputationalRisk": 2.0,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "CompanyNonCompliant": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 1.5, "ComplianceRisk": 2.0, "CriminalRisk": 0.3,
            "NarcoTerrorNexusRisk": 0.2, "BenamiRisk": 1.2,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.2,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.0,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "RecentlyIncorporatedEntity": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 1.2, "ComplianceRisk": 0.8, "CriminalRisk": 0.5,
            "NarcoTerrorNexusRisk": 0.3, "BenamiRisk": 1.5,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.2,
            "EmploymentBGVRisk": 0.5, "ReputationalRisk": 0.8,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "HighRiskIndustryCompany": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 1.5, "ComplianceRisk": 1.8, "CriminalRisk": 0.8,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 1.5,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 0.3,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.0,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "ForeignCompanyPresence": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 0.8, "ComplianceRisk": 1.5, "CriminalRisk": 0.5,
            "NarcoTerrorNexusRisk": 0.8, "BenamiRisk": 1.0,
            "PoliticalExposureRisk": 0.8, "MatrimonialRisk": 0.3,
            "EmploymentBGVRisk": 0.5, "ReputationalRisk": 0.8,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "ZeroPaidupCapital": {
        "base_severity": 8,
        "domain_weights": {
            "CreditRisk": 2.2, "ComplianceRisk": 2.0, "CriminalRisk": 1.0,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 2.5,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 0.3,
            "EmploymentBGVRisk": 1.0, "ReputationalRisk": 1.5,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "CapitalStructureAnomaly": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 1.8, "ComplianceRisk": 1.5, "CriminalRisk": 0.8,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 2.0,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 0.3,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "DisqualifiedDirectorAssociation": {
        "base_severity": 9,
        "domain_weights": {
            "CreditRisk": 2.0, "ComplianceRisk": 2.5, "CriminalRisk": 1.8,
            "NarcoTerrorNexusRisk": 1.0, "BenamiRisk": 2.0,
            "PoliticalExposureRisk": 1.5, "MatrimonialRisk": 0.5,
            "EmploymentBGVRisk": 2.0, "ReputationalRisk": 2.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    "CleanCorporateRegistryScreen": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": -0.6, "ComplianceRisk": -0.8, "CriminalRisk": -0.2,
            "NarcoTerrorNexusRisk": -0.1, "BenamiRisk": -0.6,
            "PoliticalExposureRisk": -0.2, "MatrimonialRisk": -0.1,
            "EmploymentBGVRisk": -0.4, "ReputationalRisk": -0.4,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
    # ── Financial deep factors ────────────────────────────────
    "PaymentAccountRecentlyCreated": {
        "base_severity": 6,
        "domain_weights": {
            "CreditRisk": 1.5, "ComplianceRisk": 1.2, "CriminalRisk": 1.0,
            "NarcoTerrorNexusRisk": 0.5, "BenamiRisk": 1.2,
            "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.3,
            "EmploymentBGVRisk": 0.5, "ReputationalRisk": 0.8,
            "CyberAccountTakeoverRisk": 0.5,
        },
    },
    "CryptoHighFrequencyTrader": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 1.2, "ComplianceRisk": 1.8, "CriminalRisk": 1.0,
            "NarcoTerrorNexusRisk": 1.2, "BenamiRisk": 1.5,
            "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 0.3,
            "EmploymentBGVRisk": 0.5, "ReputationalRisk": 1.0,
            "CyberAccountTakeoverRisk": 0.8,
        },
    },
    # ── FTI enhanced factors ──────────────────────────────────
    "HighRiskCountryNexus": {
        "base_severity": 7,
        "domain_weights": {
            "CreditRisk": 1.0, "ComplianceRisk": 2.0, "CriminalRisk": 1.2,
            "NarcoTerrorNexusRisk": 2.0, "BenamiRisk": 1.5,
            "PoliticalExposureRisk": 1.8, "MatrimonialRisk": 0.5,
            "EmploymentBGVRisk": 1.0, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 0.3,
        },
    },
    "EntityTypeOrganization": {
        "base_severity": 5,
        "domain_weights": {
            "CreditRisk": 1.2, "ComplianceRisk": 1.5, "CriminalRisk": 0.8,
            "NarcoTerrorNexusRisk": 0.8, "BenamiRisk": 1.5,
            "PoliticalExposureRisk": 1.0, "MatrimonialRisk": 0.3,
            "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.2,
            "CyberAccountTakeoverRisk": 0.0,
        },
    },
}


PURPOSE_PROFILES: dict[str, dict[str, float]] = {
    "Lending": {
        "CreditRisk": 2.0, "ComplianceRisk": 1.8, "CriminalRisk": 1.0,
        "NarcoTerrorNexusRisk": 0.6, "BenamiRisk": 1.4,
        "PoliticalExposureRisk": 0.6, "MatrimonialRisk": 0.0,
        "EmploymentBGVRisk": 0.4, "ReputationalRisk": 1.0,
        "CyberAccountTakeoverRisk": 0.2,
    },
    "Investment": {
        "CreditRisk": 1.6, "ComplianceRisk": 1.8, "CriminalRisk": 1.2,
        "NarcoTerrorNexusRisk": 1.0, "BenamiRisk": 1.8,
        "PoliticalExposureRisk": 1.0, "MatrimonialRisk": 0.0,
        "EmploymentBGVRisk": 0.4, "ReputationalRisk": 1.2,
        "CyberAccountTakeoverRisk": 0.0,
    },
    "VendorOnboarding": {
        "CreditRisk": 1.4, "ComplianceRisk": 2.0, "CriminalRisk": 1.0,
        "NarcoTerrorNexusRisk": 0.8, "BenamiRisk": 1.5,
        "PoliticalExposureRisk": 1.2, "MatrimonialRisk": 0.0,
        "EmploymentBGVRisk": 0.6, "ReputationalRisk": 1.0,
        "CyberAccountTakeoverRisk": 0.5,
    },
    "Employment": {
        "CreditRisk": 0.5, "ComplianceRisk": 1.2, "CriminalRisk": 2.0,
        "NarcoTerrorNexusRisk": 0.8, "BenamiRisk": 0.4,
        "PoliticalExposureRisk": 0.6, "MatrimonialRisk": 0.0,
        "EmploymentBGVRisk": 2.5, "ReputationalRisk": 1.0,
        "CyberAccountTakeoverRisk": 1.0,
    },
    "Matrimonial": {
        "CreditRisk": 0.6, "ComplianceRisk": 0.4, "CriminalRisk": 2.0,
        "NarcoTerrorNexusRisk": 1.0, "BenamiRisk": 0.8,
        "PoliticalExposureRisk": 0.5, "MatrimonialRisk": 2.5,
        "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.4,
        "CyberAccountTakeoverRisk": 0.0,
    },
    "GovernmentContract": {
        "CreditRisk": 1.0, "ComplianceRisk": 2.0, "CriminalRisk": 1.6,
        "NarcoTerrorNexusRisk": 1.5, "BenamiRisk": 1.5,
        "PoliticalExposureRisk": 2.0, "MatrimonialRisk": 0.0,
        "EmploymentBGVRisk": 0.6, "ReputationalRisk": 1.2,
        "CyberAccountTakeoverRisk": 0.6,
    },
    "SecurityClearance": {
        "CreditRisk": 0.6, "ComplianceRisk": 1.4, "CriminalRisk": 2.4,
        "NarcoTerrorNexusRisk": 2.4, "BenamiRisk": 0.8,
        "PoliticalExposureRisk": 1.4, "MatrimonialRisk": 0.0,
        "EmploymentBGVRisk": 1.0, "ReputationalRisk": 1.2,
        "CyberAccountTakeoverRisk": 1.8,
    },
    "InsuranceUnderwriting": {
        "CreditRisk": 1.6, "ComplianceRisk": 1.4, "CriminalRisk": 1.4,
        "NarcoTerrorNexusRisk": 0.4, "BenamiRisk": 1.0,
        "PoliticalExposureRisk": 0.6, "MatrimonialRisk": 0.0,
        "EmploymentBGVRisk": 0.6, "ReputationalRisk": 0.8,
        "CyberAccountTakeoverRisk": 0.2,
    },
    "GeneralDueDiligence": {
        "CreditRisk": 1.0, "ComplianceRisk": 1.2, "CriminalRisk": 1.2,
        "NarcoTerrorNexusRisk": 0.8, "BenamiRisk": 1.0,
        "PoliticalExposureRisk": 0.8, "MatrimonialRisk": 0.0,
        "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.0,
        "CyberAccountTakeoverRisk": 0.6,
    },
    "TenantScreening": {
        "CreditRisk": 2.0, "ComplianceRisk": 0.8, "CriminalRisk": 2.2,
        "NarcoTerrorNexusRisk": 1.2, "BenamiRisk": 0.6,
        "PoliticalExposureRisk": 0.3, "MatrimonialRisk": 0.0,
        "EmploymentBGVRisk": 1.4, "ReputationalRisk": 1.0,
        "CyberAccountTakeoverRisk": 0.2,
    },
    "BoardDirectorDueDiligence": {
        "CreditRisk": 1.8, "ComplianceRisk": 2.2, "CriminalRisk": 2.0,
        "NarcoTerrorNexusRisk": 1.2, "BenamiRisk": 2.0,
        "PoliticalExposureRisk": 2.0, "MatrimonialRisk": 0.0,
        "EmploymentBGVRisk": 1.2, "ReputationalRisk": 2.0,
        "CyberAccountTakeoverRisk": 0.8,
    },
    "AMLCompliance": {
        "CreditRisk": 1.5, "ComplianceRisk": 2.5, "CriminalRisk": 1.5,
        "NarcoTerrorNexusRisk": 2.0, "BenamiRisk": 2.2,
        "PoliticalExposureRisk": 1.8, "MatrimonialRisk": 0.0,
        "EmploymentBGVRisk": 0.4, "ReputationalRisk": 1.0,
        "CyberAccountTakeoverRisk": 0.4,
    },
    "ThirdPartyRiskManagement": {
        "CreditRisk": 1.4, "ComplianceRisk": 1.8, "CriminalRisk": 1.2,
        "NarcoTerrorNexusRisk": 0.8, "BenamiRisk": 1.4,
        "PoliticalExposureRisk": 1.0, "MatrimonialRisk": 0.0,
        "EmploymentBGVRisk": 0.8, "ReputationalRisk": 1.2,
        "CyberAccountTakeoverRisk": 1.2,
    },
    "PartnershipDueDiligence": {
        "CreditRisk": 1.8, "ComplianceRisk": 2.0, "CriminalRisk": 1.8,
        "NarcoTerrorNexusRisk": 1.2, "BenamiRisk": 1.8,
        "PoliticalExposureRisk": 1.5, "MatrimonialRisk": 0.0,
        "EmploymentBGVRisk": 0.6, "ReputationalRisk": 1.8,
        "CyberAccountTakeoverRisk": 0.6,
    },
}


CONFIDENCE_FROM_TIER = {"A": 1.0, "B": 0.6, "C": 0.2}


DOMAIN_LABELS = {
    "CreditRisk": "Credit",
    "ComplianceRisk": "Compliance",
    "CriminalRisk": "Criminal",
    "NarcoTerrorNexusRisk": "Narco-Terror",
    "BenamiRisk": "Benami",
    "PoliticalExposureRisk": "Political",
    "MatrimonialRisk": "Matrimonial",
    "EmploymentBGVRisk": "Employment",
    "ReputationalRisk": "Reputational",
    "CyberAccountTakeoverRisk": "Cyber",
}

_DOMAINS = list(DOMAIN_LABELS.keys())


def _level(value: float) -> str:
    if value >= 7.0:
        return "CRITICAL"
    if value >= 4.5:
        return "HIGH"
    if value >= 2.0:
        return "MEDIUM"
    return "LOW"


def score(
    factors: list[dict],
    purpose: str = "GeneralDueDiligence",
) -> dict:
    if not factors:
        return None

    purpose_weights = PURPOSE_PROFILES.get(purpose, PURPOSE_PROFILES["GeneralDueDiligence"])

    domain_raw: dict[str, float] = {d: 0.0 for d in _DOMAINS}
    factor_count = 0
    mitigating_count = 0

    for factor in factors:
        fid = factor.get("factor_id")
        confidence = factor.get("confidence", 0.2)
        catalog_entry = FACTOR_CATALOG.get(fid)
        if not catalog_entry:
            continue

        base_severity = catalog_entry["base_severity"]
        raw_score = base_severity * confidence

        is_mitigating = any(w < 0 for w in catalog_entry["domain_weights"].values())
        if is_mitigating:
            mitigating_count += 1
        else:
            factor_count += 1

        for domain, weight in catalog_entry["domain_weights"].items():
            domain_raw[domain] += raw_score * weight

    domain_normalized: dict[str, float] = {}
    for d in _DOMAINS:
        domain_normalized[d] = max(0.0, min(10.0, domain_raw[d] / 25.0))

    total_weight = sum(purpose_weights.get(d, 0.0) for d in _DOMAINS)
    if total_weight <= 0:
        total_weight = 1.0

    composite = sum(
        domain_normalized[d] * purpose_weights.get(d, 0.0)
        for d in _DOMAINS
    ) / total_weight
    composite = max(0.0, min(10.0, composite))

    domains = []
    for d in _DOMAINS:
        d_level = _level(domain_normalized[d])
        if d_level in ("MEDIUM", "HIGH", "CRITICAL"):
            domains.append({
                "name": DOMAIN_LABELS[d],
                "level": d_level,
            })

    return {
        "composite": round(composite, 1),
        "level": _level(composite),
        "domains": domains,
        "factor_count": factor_count,
        "mitigating_count": mitigating_count,
    }
