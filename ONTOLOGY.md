# Auracle Risk Ontology Reference

**109 factors** across **14 categories** scoring into **10 risk domains** via **14 purpose profiles**

**104 factors live** in the current pipeline, **5 blocked** on external KYC/ITR service integration

---

## Scoring Math

```
raw_score     = base_severity x confidence
domain_raw   += raw_score x domain_weight        (per factor)
domain_norm   = clamp(domain_raw / 25, 0, 10)
composite     = weighted_avg(domain_norm, purpose_weights)
```

**Confidence tiers:** A = 1.0 (verified), B = 0.6 (confirmed), C = 0.2 (pattern-match)

**Levels:** CRITICAL >= 7.0, HIGH >= 4.5, MEDIUM >= 2.0, LOW < 2.0

---

## Risk Domains (10)

| # | Domain | Short | Description |
|---|--------|-------|-------------|
| 1 | Credit | Cred | Financial creditworthiness and lending risk |
| 2 | Compliance | Comp | Regulatory compliance and legal obligations |
| 3 | Criminal | Crim | Criminal history and law enforcement exposure |
| 4 | Narco-Terror Nexus | NT | Narcotics, terrorism, and extremist network links |
| 5 | Benami/Shell | Ben | Benami/shell entity and proxy ownership patterns |
| 6 | Political Exposure | PEP | Political connections and PEP status |
| 7 | Matrimonial | Mat | Matrimonial fraud, domestic violence, dowry |
| 8 | Employment/BGV | Emp | Background verification for employment |
| 9 | Reputational | Rep | Public reputation and media exposure |
| 10 | Cyber/ATO | Cyber | Cyber threats and account takeover vulnerability |

---

## Factor Catalog (109)

### Identity (6 factors)

*Subject identity verification signals — PAN, Aadhaar, aliases, phones, addresses*

| Factor | Sev | Status | Cred | Comp | Crim | NT | Ben | PEP | Mat | Emp | Rep | Cyber |
|--------|-----|--------|----:|----:|----:|----:|----:|----:|----:|----:|----:|----:|
| MultiplePANSuspicion | 8 | LIVE | 1.5 | 2.0 | 0.7 | 0.8 | 2.2 | 0.7 | 1.5 | 1.2 | 1.0 | - |
| PANDiscrepancy | 7 | DEAD | 1.5 | 2.0 | 0.3 | 0.4 | 1.6 | 0.5 | 1.0 | 1.2 | 0.8 | - |
| AadhaarUnverified | 4 | DEAD | 0.8 | 1.5 | 0.2 | 0.2 | 0.8 | 0.2 | 0.4 | 0.7 | 0.2 | - |
| AliasIdentity | 4 | LIVE | 0.5 | 0.8 | 0.5 | 0.6 | 1.2 | 0.5 | 1.2 | 0.8 | 0.6 | - |
| UnreportedSecondaryMobile | 3 | LIVE | 0.3 | 0.6 | 0.3 | 0.5 | 0.5 | 0.3 | 0.8 | 0.5 | 0.2 | - |
| AddressInconsistency | 3 | LIVE | 0.5 | 0.7 | 0.2 | 0.2 | 0.4 | 0.1 | 0.5 | 0.6 | 0.2 | - |

### Criminal (10 factors)

*Criminal case type classification from crime databases and court records*

| Factor | Sev | Status | Cred | Comp | Crim | NT | Ben | PEP | Mat | Emp | Rep | Cyber |
|--------|-----|--------|----:|----:|----:|----:|----:|----:|----:|----:|----:|----:|
| PendingCriminalMatter_Sexual | 10 | LIVE | 1.5 | 1.8 | 2.5 | 0.5 | 0.3 | 1.8 | 2.5 | 2.5 | 2.5 | - |
| NDPSMatter_Pending | 10 | LIVE | 1.5 | 2.0 | 2.4 | 2.5 | 1.0 | 2.0 | 2.5 | 2.4 | 2.4 | - |
| UAPAMatter | 10 | LIVE | 2.0 | 2.5 | 2.5 | 2.5 | 1.5 | 2.5 | 2.5 | 2.5 | 2.5 | - |
| PendingCriminalMatter_Violent | 9 | LIVE | 1.5 | 1.5 | 2.4 | 0.8 | 0.5 | 1.5 | 2.4 | 2.4 | 2.0 | - |
| PMLAMatter_Pending | 9 | LIVE | 2.0 | 2.5 | 1.5 | 1.5 | 2.0 | 1.8 | 2.0 | 2.0 | 2.2 | - |
| CorruptionMatter | 8 | LIVE | 1.5 | 2.2 | 1.8 | 0.6 | 1.5 | 2.0 | 1.8 | 2.0 | 2.2 | - |
| PendingCriminalMatter_General | 7 | LIVE | 1.0 | 1.2 | 2.0 | 0.5 | 0.5 | 1.2 | 1.8 | 1.8 | 1.5 | - |
| DomesticViolenceMatter | 7 | LIVE | 0.4 | 0.5 | 1.5 | - | - | 0.5 | 2.4 | 1.0 | 1.5 | - |
| DisposedCriminalMatter | 4 | LIVE | 0.4 | 0.5 | 1.0 | 0.2 | 0.2 | 0.5 | 0.8 | 0.8 | 0.6 | - |
| MotorVehicleMatter_Disposed | 2 | LIVE | 0.1 | 0.1 | 0.3 | - | - | 0.1 | 0.3 | 0.3 | 0.2 | - |

### Financial (12 factors)

*Financial fraud indicators — payment accounts, crypto, bank accounts, cheque dishonour*

| Factor | Sev | Status | Cred | Comp | Crim | NT | Ben | PEP | Mat | Emp | Rep | Cyber |
|--------|-----|--------|----:|----:|----:|----:|----:|----:|----:|----:|----:|----:|
| FraudLinkedPaymentAccount | 9 | LIVE | 2.2 | 2.0 | 2.0 | 0.5 | 1.5 | 0.5 | 1.5 | 2.0 | 1.8 | 0.5 |
| FlaggedBankAccount | 8 | LIVE | 2.0 | 2.0 | 1.5 | 0.5 | 1.5 | 0.5 | 1.2 | 1.8 | 1.5 | 0.3 |
| ChequeDishonourHistory | 7 | LIVE | 2.0 | 1.5 | 0.8 | - | 0.4 | 0.5 | 1.2 | 0.8 | 1.0 | - |
| BettingSiteLinkedPayment | 7 | LIVE | 1.5 | 1.5 | 1.0 | 0.3 | 0.8 | 0.4 | 1.2 | 1.5 | 1.5 | 0.3 |
| FraudDomainLinkedPayment | 7 | LIVE | 1.8 | 1.5 | 1.5 | 0.3 | 0.8 | 0.3 | 0.8 | 1.5 | 1.2 | 0.8 |
| HighValueCryptoTransaction | 7 | LIVE | 1.0 | 1.5 | 0.8 | 1.0 | 1.5 | 0.5 | 0.3 | 0.5 | 0.8 | 0.5 |
| CryptoHighFrequencyTrader | 7 | LIVE | 1.2 | 1.8 | 1.0 | 1.2 | 1.5 | 0.5 | 0.3 | 0.5 | 1.0 | 0.8 |
| IncomeInconsistency | 6 | DEAD | 1.8 | 1.5 | 0.4 | 0.4 | 1.5 | 0.6 | 1.5 | 1.0 | 0.6 | - |
| CryptoWalletExposure | 6 | LIVE | 0.8 | 1.2 | 0.5 | 0.6 | 1.2 | 0.4 | 0.3 | 0.6 | 0.6 | 0.8 |
| PaymentAccountRecentlyCreated | 6 | LIVE | 1.5 | 1.2 | 1.0 | 0.5 | 1.2 | 0.3 | 0.3 | 0.5 | 0.8 | 0.5 |
| CryptoExchangeLinkedPayment | 5 | LIVE | 0.8 | 1.2 | 0.3 | 0.4 | 1.0 | 0.3 | 0.3 | 0.5 | 0.5 | 0.5 |
| MultiplePaymentAccountsPerPhone | 5 | LIVE | 1.0 | 1.0 | 0.5 | 0.3 | 1.2 | 0.3 | 0.3 | 0.5 | 0.5 | 0.3 |

### Screening (5 factors)

*Watchlist and adverse media screening — PEP, sanctions, global adverse screening*

| Factor | Sev | Status | Cred | Comp | Crim | NT | Ben | PEP | Mat | Emp | Rep | Cyber |
|--------|-----|--------|----:|----:|----:|----:|----:|----:|----:|----:|----:|----:|
| SanctionsMatch | 10 | LIVE | 2.5 | 2.5 | 2.0 | 2.5 | 2.0 | 2.5 | 2.0 | 2.5 | 2.5 | - |
| PEPStatus | 6 | LIVE | 0.8 | 1.8 | 0.3 | 0.5 | 1.2 | 2.5 | 1.0 | 1.0 | 1.0 | 0.5 |
| GlobalAdverseScreeningStatus | 5 | LIVE | 0.5 | 1.5 | 0.2 | 0.4 | 1.0 | 2.0 | 0.8 | 1.2 | 1.2 | 0.6 |
| AdverseCharacterSignal | 5 | LIVE | 0.2 | 0.3 | 0.4 | - | - | 0.4 | 1.5 | 0.6 | 1.2 | - |
| AdverseMediaHit | 5 | LIVE | 0.4 | 0.6 | 0.6 | 0.3 | 0.4 | 0.8 | 1.0 | 0.8 | 2.0 | - |

### Matrimonial (3 factors)

*Matrimonial-specific risk factors — dowry, undisclosed marriages, conflicts*

| Factor | Sev | Status | Cred | Comp | Crim | NT | Ben | PEP | Mat | Emp | Rep | Cyber |
|--------|-----|--------|----:|----:|----:|----:|----:|----:|----:|----:|----:|----:|
| UndisclosedExistingMarriage | 10 | DEAD | 0.2 | 0.5 | 1.5 | - | 0.5 | 0.3 | 2.5 | 0.5 | 2.0 | - |
| DowryHarassmentMatter | 9 | LIVE | 0.3 | 0.5 | 1.8 | - | - | 0.4 | 2.5 | 1.0 | 1.8 | - |
| ConflictOfInterest | 6 | DEAD | 0.4 | 1.5 | 0.4 | 0.2 | 1.0 | 1.8 | 0.4 | 0.8 | 1.2 | - |

### CourtRecords (22 factors)

*Litigation analysis from court records — case types, severity, patterns*

| Factor | Sev | Status | Cred | Comp | Crim | NT | Ben | PEP | Mat | Emp | Rep | Cyber |
|--------|-----|--------|----:|----:|----:|----:|----:|----:|----:|----:|----:|----:|
| CriminalConviction | 10 | LIVE | 2.0 | 2.5 | 2.5 | 1.5 | 1.2 | 2.0 | 2.5 | 2.5 | 2.5 | - |
| InsolvencyProceeding | 8 | LIVE | 2.2 | 1.8 | 0.5 | 0.3 | 1.5 | 0.5 | 1.0 | 1.8 | 1.8 | - |
| CriminalRespondent | 8 | LIVE | 1.2 | 1.5 | 2.2 | 0.8 | 0.6 | 1.2 | 2.0 | 2.2 | 1.8 | - |
| DivisionBenchMatter | 7 | LIVE | 0.8 | 1.5 | 1.2 | 0.5 | 0.6 | 0.8 | 0.5 | 1.2 | 1.5 | - |
| NegotiableInstrumentDishonour | 7 | LIVE | 2.0 | 1.5 | 0.8 | - | 0.4 | 0.3 | 1.0 | 0.8 | 1.0 | - |
| HCStayedProceedings | 6 | LIVE | 0.6 | 1.2 | 1.4 | 0.3 | 0.4 | 0.4 | 0.7 | 1.3 | 1.4 | - |
| CommercialCourtCase | 6 | LIVE | 1.5 | 1.2 | 0.3 | 0.2 | 1.0 | 0.4 | 0.2 | 0.8 | 1.2 | - |
| HighCourtLitigation | 6 | LIVE | 0.8 | 1.2 | 0.8 | 0.3 | 0.5 | 0.6 | 0.5 | 1.0 | 1.2 | - |
| AdverseCourtOrder | 6 | LIVE | 0.8 | 1.0 | 0.5 | 0.2 | 0.5 | 0.4 | 0.6 | 0.8 | 1.0 | - |
| FIRLinkedCase | 6 | LIVE | 0.5 | 1.0 | 1.5 | 0.5 | 0.3 | 0.5 | 1.0 | 1.5 | 1.2 | - |
| ActiveLitigationAsRespondent | 5 | LIVE | 0.8 | 1.0 | 0.5 | 0.1 | 0.4 | 0.4 | 0.6 | 1.0 | 1.4 | - |
| FamilyCourtMatter | 5 | LIVE | 0.3 | 0.3 | 0.3 | - | 0.2 | 0.2 | 2.2 | 0.5 | 0.8 | - |
| LandPropertyDispute | 5 | LIVE | 1.0 | 0.6 | 0.3 | - | 1.5 | 0.3 | 0.5 | 0.4 | 0.6 | - |
| LongPendingLitigation | 5 | LIVE | 0.8 | 0.8 | 0.5 | 0.2 | 0.4 | 0.3 | 0.5 | 0.6 | 0.8 | - |
| HighlyContestedCase | 5 | LIVE | 0.6 | 0.8 | 0.5 | 0.2 | 0.4 | 0.4 | 0.5 | 0.6 | 0.8 | - |
| SerialLitigant | 5 | LIVE | 0.8 | 0.8 | 0.5 | 0.2 | 0.5 | 0.4 | 0.8 | 0.6 | 1.2 | - |
| MultiJurisdictionExposure | 5 | LIVE | 0.6 | 0.8 | 0.5 | 0.4 | 0.6 | 0.4 | 0.4 | 0.5 | 0.8 | - |
| CriminalAcquittal | 5 | LIVE | -0.3 | -0.5 | -1.5 | -0.5 | -0.2 | -0.3 | -0.8 | -1.0 | -0.8 | - |
| RecentFilingSpike | 5 | LIVE | 0.8 | 0.8 | 0.6 | 0.3 | 0.5 | 0.4 | 0.6 | 0.8 | 1.0 | - |
| ActiveCivilDispute | 4 | LIVE | 0.8 | 0.6 | 0.2 | - | 0.3 | 0.4 | 0.8 | 0.4 | 0.6 | - |
| LaborDispute | 4 | LIVE | 0.4 | 0.8 | 0.2 | - | 0.2 | 0.3 | 0.1 | 1.8 | 0.8 | - |
| ConsumerComplaint | 3 | LIVE | 0.5 | 0.5 | 0.1 | - | 0.2 | 0.1 | 0.2 | 0.3 | 0.8 | - |

### Breach (12 factors)

*Data breach exposure analysis — credential, PII, and financial data leaks*

| Factor | Sev | Status | Cred | Comp | Crim | NT | Ben | PEP | Mat | Emp | Rep | Cyber |
|--------|-----|--------|----:|----:|----:|----:|----:|----:|----:|----:|----:|----:|
| GovernmentIDExposure | 8 | LIVE | 1.5 | 2.0 | 0.8 | 0.3 | 1.5 | 0.5 | 0.8 | 1.5 | 1.2 | 0.8 |
| ActiveCredentialExposure | 7 | LIVE | 0.3 | 0.5 | - | - | - | 0.8 | 0.2 | 1.2 | 0.3 | 2.2 |
| FinancialDataInBreach | 7 | LIVE | 2.0 | 1.5 | 0.5 | 0.3 | 1.0 | 0.3 | 0.5 | 0.8 | 0.8 | 1.5 |
| ReusedCredentialAcrossBreaches | 6 | LIVE | 0.2 | 0.4 | - | - | - | 0.7 | 0.2 | 1.0 | 0.3 | 2.0 |
| MassBreachExposure | 6 | LIVE | 0.5 | 0.5 | - | - | - | 0.3 | 0.3 | 1.0 | 0.5 | 2.0 |
| GovernmentEmailExposure | 6 | LIVE | 0.3 | 1.5 | 0.2 | 0.3 | 0.3 | 1.2 | 0.3 | 1.5 | 1.2 | 1.5 |
| HealthDataExposure | 6 | LIVE | 0.2 | 1.5 | 0.2 | - | - | 0.3 | 1.0 | 0.8 | 1.2 | 0.5 |
| PlaintextPasswordExposure | 5 | LIVE | 0.2 | 0.3 | - | - | - | 0.5 | 0.2 | 0.8 | 0.3 | 1.8 |
| BreachRecencyRisk | 5 | LIVE | 0.3 | 0.5 | - | - | - | 0.3 | 0.2 | 0.8 | 0.3 | 1.8 |
| DateOfBirthExposure | 5 | LIVE | 0.8 | 0.8 | 0.3 | 0.2 | 0.5 | 0.2 | 0.5 | 0.8 | 0.3 | 1.0 |
| WeakPasswordPattern | 5 | LIVE | 0.2 | 0.3 | - | - | - | 0.3 | 0.2 | 0.8 | 0.3 | 2.0 |
| CorporateEmailExposure | 4 | LIVE | 0.2 | 0.5 | - | - | - | 0.3 | 0.2 | 1.0 | 0.5 | 1.2 |

### ThreatIntel (4 factors)

*Threat intelligence network analysis — criminal networks, sanctioned entities, country risk*

| Factor | Sev | Status | Cred | Comp | Crim | NT | Ben | PEP | Mat | Emp | Rep | Cyber |
|--------|-----|--------|----:|----:|----:|----:|----:|----:|----:|----:|----:|----:|
| SanctionedEntityNetwork | 8 | LIVE | 1.5 | 2.2 | 1.5 | 2.0 | 1.5 | 2.0 | 1.0 | 1.8 | 2.0 | 0.3 |
| CriminalNetworkProximity | 7 | LIVE | 0.8 | 1.5 | 2.0 | 1.5 | 1.0 | 0.8 | 1.2 | 1.5 | 1.5 | 0.3 |
| HighRiskCountryNexus | 7 | LIVE | 1.0 | 2.0 | 1.2 | 2.0 | 1.5 | 1.8 | 0.5 | 1.0 | 1.2 | 0.3 |
| EntityTypeOrganization | 5 | LIVE | 1.2 | 1.5 | 0.8 | 0.8 | 1.5 | 1.0 | 0.3 | 0.8 | 1.2 | - |

### Underground (12 factors)

*Underground forum activity — authorship, vendor status, influence, crypto wallets*

| Factor | Sev | Status | Cred | Comp | Crim | NT | Ben | PEP | Mat | Emp | Rep | Cyber |
|--------|-----|--------|----:|----:|----:|----:|----:|----:|----:|----:|----:|----:|
| DrugMarketplaceLinkage | 9 | LIVE | 1.5 | 2.0 | 2.2 | 2.5 | 1.0 | 1.5 | 2.0 | 2.2 | 2.2 | 0.5 |
| UndergroundVendorStatus | 9 | LIVE | 0.8 | 1.5 | 2.2 | 2.0 | 0.8 | 0.8 | 1.5 | 2.2 | 2.2 | 1.8 |
| UndergroundHighActivity | 8 | LIVE | 0.6 | 1.2 | 1.8 | 1.2 | 0.6 | 0.6 | 1.2 | 1.8 | 2.0 | 2.0 |
| UndergroundCyberThreats | 8 | LIVE | 0.5 | 1.2 | 1.8 | 1.0 | 0.3 | 0.5 | 0.8 | 1.8 | 1.8 | 2.2 |
| UndergroundForumAuthor | 7 | LIVE | 0.5 | 1.0 | 1.5 | 1.0 | 0.5 | 0.5 | 1.0 | 1.5 | 1.5 | 1.5 |
| UndergroundLongTermPresence | 7 | LIVE | 0.5 | 1.0 | 1.5 | 1.2 | 0.5 | 0.5 | 1.0 | 1.5 | 1.8 | 1.5 |
| UndergroundCryptoWallet | 7 | LIVE | 0.8 | 1.2 | 1.2 | 1.0 | 1.0 | 0.5 | 0.3 | 0.8 | 1.0 | 1.2 |
| UndergroundRegionalTargeting | 6 | LIVE | 0.5 | 1.0 | 1.2 | 1.5 | 0.8 | 0.6 | 0.5 | 1.0 | 1.2 | 1.2 |
| UndergroundRecentActivity | 6 | LIVE | 0.4 | 0.8 | 1.2 | 0.8 | 0.4 | 0.4 | 0.8 | 1.2 | 1.5 | 1.0 |
| UndergroundHighInfluence | 6 | LIVE | 0.3 | 0.8 | 1.0 | 0.8 | 0.3 | 0.4 | 0.6 | 1.0 | 1.5 | 1.2 |
| UndergroundContactExposure | 5 | LIVE | 0.3 | 0.5 | 0.8 | 0.5 | 0.2 | 0.3 | 0.5 | 0.8 | 1.0 | 1.0 |
| UndergroundForumDiversity | 5 | LIVE | 0.3 | 0.6 | 0.8 | 0.5 | 0.3 | 0.3 | 0.5 | 0.8 | 1.0 | 0.8 |

### Messaging (2 factors)

*Messaging platform exposure — group mentions, high-exposure channels*

| Factor | Sev | Status | Cred | Comp | Crim | NT | Ben | PEP | Mat | Emp | Rep | Cyber |
|--------|-----|--------|----:|----:|----:|----:|----:|----:|----:|----:|----:|----:|
| MessagingHighExposure | 7 | LIVE | 0.5 | 0.8 | 1.0 | 0.8 | 0.5 | 0.5 | 0.8 | 1.2 | 1.8 | 0.5 |
| MessagingGroupMention | 5 | LIVE | 0.3 | 0.5 | 0.5 | 0.5 | 0.3 | 0.3 | 0.5 | 0.8 | 1.2 | 0.3 |

### Phone (1 factors)

*Phone intelligence — fraud database flags, spam indicators*

| Factor | Sev | Status | Cred | Comp | Crim | NT | Ben | PEP | Mat | Emp | Rep | Cyber |
|--------|-----|--------|----:|----:|----:|----:|----:|----:|----:|----:|----:|----:|
| PhoneFraudDatabaseFlag | 7 | LIVE | 1.5 | 1.5 | 1.8 | 0.5 | 0.8 | 0.5 | 1.0 | 1.8 | 1.5 | 1.0 |

### CrossSource (1 factors)

*Cross-source correlation — multi-source adverse convergence*

| Factor | Sev | Status | Cred | Comp | Crim | NT | Ben | PEP | Mat | Emp | Rep | Cyber |
|--------|-----|--------|----:|----:|----:|----:|----:|----:|----:|----:|----:|----:|
| MultiSourceAdverseConvergence | 7 | LIVE | 1.0 | 1.2 | 1.5 | 0.8 | 0.8 | 0.6 | 1.0 | 1.5 | 1.5 | 0.5 |

### Corporate (11 factors)

*Corporate registry analysis — company status, capital, compliance, shell indicators*

| Factor | Sev | Status | Cred | Comp | Crim | NT | Ben | PEP | Mat | Emp | Rep | Cyber |
|--------|-----|--------|----:|----:|----:|----:|----:|----:|----:|----:|----:|----:|
| ShellCompanyIndicators | 9 | LIVE | 2.2 | 2.5 | 1.5 | 1.2 | 2.5 | 1.0 | 0.5 | 1.0 | 2.0 | - |
| DisqualifiedDirectorAssociation | 9 | LIVE | 2.0 | 2.5 | 1.8 | 1.0 | 2.0 | 1.5 | 0.5 | 2.0 | 2.2 | - |
| CompanyDissolved | 8 | LIVE | 2.0 | 1.8 | 0.8 | 0.5 | 2.0 | 0.5 | 0.3 | 1.5 | 1.5 | - |
| ZeroPaidupCapital | 8 | LIVE | 2.2 | 2.0 | 1.0 | 0.5 | 2.5 | 0.5 | 0.3 | 1.0 | 1.5 | - |
| CompanyUnderStrikeOff | 7 | LIVE | 1.8 | 1.5 | 0.6 | 0.3 | 1.8 | 0.3 | 0.2 | 1.2 | 1.2 | - |
| CapitalStructureAnomaly | 7 | LIVE | 1.8 | 1.5 | 0.8 | 0.5 | 2.0 | 0.5 | 0.3 | 0.8 | 1.2 | - |
| CompanyNonCompliant | 6 | LIVE | 1.5 | 2.0 | 0.3 | 0.2 | 1.2 | 0.3 | 0.2 | 0.8 | 1.0 | - |
| HighRiskIndustryCompany | 6 | LIVE | 1.5 | 1.8 | 0.8 | 0.5 | 1.5 | 0.5 | 0.3 | 0.8 | 1.0 | - |
| RecentlyIncorporatedEntity | 5 | LIVE | 1.2 | 0.8 | 0.5 | 0.3 | 1.5 | 0.3 | 0.2 | 0.5 | 0.8 | - |
| ForeignCompanyPresence | 5 | LIVE | 0.8 | 1.5 | 0.5 | 0.8 | 1.0 | 0.8 | 0.3 | 0.5 | 0.8 | - |
| CleanCorporateRegistryScreen | 5 | LIVE | -0.6 | -0.8 | -0.2 | -0.1 | -0.6 | -0.2 | -0.1 | -0.4 | -0.4 | - |

### Mitigating (8 factors)

*Risk-reducing factors — clean screens, verified identity, stable location*

| Factor | Sev | Status | Cred | Comp | Crim | NT | Ben | PEP | Mat | Emp | Rep | Cyber |
|--------|-----|--------|----:|----:|----:|----:|----:|----:|----:|----:|----:|----:|
| IdentityCorroborated | 5 | LIVE | -1.0 | -1.5 | -0.5 | -0.5 | -0.8 | -0.5 | -0.8 | -1.0 | -0.5 | - |
| EmployerVerified | 5 | LIVE | -1.0 | -1.0 | -0.5 | -0.3 | -0.5 | -0.5 | -1.0 | -2.0 | -0.5 | - |
| CleanLitigationScreen | 5 | LIVE | -0.6 | -0.8 | -2.2 | -1.5 | -0.5 | -0.6 | -1.5 | -1.5 | -1.0 | - |
| CleanCourtRecordsScreen | 5 | LIVE | -0.8 | -1.0 | -2.0 | -1.0 | -0.5 | -0.5 | -1.2 | -1.5 | -1.0 | - |
| CleanFinancialScreen | 4 | LIVE | -1.5 | -1.0 | -0.5 | -0.3 | -0.8 | -0.2 | -0.4 | -0.5 | -0.3 | - |
| CleanUndergroundScreen | 4 | LIVE | -0.3 | -0.5 | -1.0 | -1.0 | -0.3 | -0.3 | -0.5 | -0.8 | -0.8 | -1.0 |
| StableLocationFootprint | 3 | LIVE | -0.4 | -0.5 | -0.2 | -0.3 | -0.3 | -0.1 | -0.4 | -0.5 | -0.2 | - |
| CleanMessagingScreen | 3 | LIVE | -0.2 | -0.3 | -0.3 | -0.3 | -0.2 | -0.2 | -0.3 | -0.4 | -0.5 | -0.2 |

---

## Purpose Profiles (14)

Domain weights that shape how the composite score is computed per use case.

| Profile | Cred | Comp | Crim | NT | Ben | PEP | Mat | Emp | Rep | Cyber |
|---------|----:|----:|----:|----:|----:|----:|----:|----:|----:|----:|
| Lending | 2.0 | 1.8 | 1.0 | 0.6 | 1.4 | 0.6 | 0.0 | 0.4 | 1.0 | 0.2 |
| Investment | 1.6 | 1.8 | 1.2 | 1.0 | 1.8 | 1.0 | 0.0 | 0.4 | 1.2 | 0.0 |
| VendorOnboarding | 1.4 | 2.0 | 1.0 | 0.8 | 1.5 | 1.2 | 0.0 | 0.6 | 1.0 | 0.5 |
| Employment | 0.5 | 1.2 | 2.0 | 0.8 | 0.4 | 0.6 | 0.0 | 2.5 | 1.0 | 1.0 |
| Matrimonial | 0.6 | 0.4 | 2.0 | 1.0 | 0.8 | 0.5 | 2.5 | 0.8 | 1.4 | 0.0 |
| GovernmentContract | 1.0 | 2.0 | 1.6 | 1.5 | 1.5 | 2.0 | 0.0 | 0.6 | 1.2 | 0.6 |
| SecurityClearance | 0.6 | 1.4 | 2.4 | 2.4 | 0.8 | 1.4 | 0.0 | 1.0 | 1.2 | 1.8 |
| InsuranceUnderwriting | 1.6 | 1.4 | 1.4 | 0.4 | 1.0 | 0.6 | 0.0 | 0.6 | 0.8 | 0.2 |
| GeneralDueDiligence | 1.0 | 1.2 | 1.2 | 0.8 | 1.0 | 0.8 | 0.0 | 0.8 | 1.0 | 0.6 |
| TenantScreening | 2.0 | 0.8 | 2.2 | 1.2 | 0.6 | 0.3 | 0.0 | 1.4 | 1.0 | 0.2 |
| BoardDirectorDueDiligence | 1.8 | 2.2 | 2.0 | 1.2 | 2.0 | 2.0 | 0.0 | 1.2 | 2.0 | 0.8 |
| AMLCompliance | 1.5 | 2.5 | 1.5 | 2.0 | 2.2 | 1.8 | 0.0 | 0.4 | 1.0 | 0.4 |
| ThirdPartyRiskManagement | 1.4 | 1.8 | 1.2 | 0.8 | 1.4 | 1.0 | 0.0 | 0.8 | 1.2 | 1.2 |
| PartnershipDueDiligence | 1.8 | 2.0 | 1.8 | 1.2 | 1.8 | 1.5 | 0.0 | 0.6 | 1.8 | 0.6 |

---

## Current Status

### Live factors by category

| Category | Total | Live | Dead | Mitigating |
|----------|-------|------|------|------------|
| Identity | 6 | 4 | 2 | 0 |
| Criminal | 10 | 10 | 0 | 0 |
| Financial | 12 | 11 | 1 | 0 |
| Screening | 5 | 5 | 0 | 0 |
| Matrimonial | 3 | 1 | 2 | 0 |
| CourtRecords | 22 | 22 | 0 | 0 |
| Breach | 12 | 12 | 0 | 0 |
| ThreatIntel | 4 | 4 | 0 | 0 |
| Underground | 12 | 12 | 0 | 0 |
| Messaging | 2 | 2 | 0 | 0 |
| Phone | 1 | 1 | 0 | 0 |
| CrossSource | 1 | 1 | 0 | 0 |
| Corporate | 11 | 11 | 0 | 0 |
| Mitigating | 8 | 8 | 0 | 0 |

### Dead factors (blocked on external services)

| Factor | Category | Blocker |
|--------|----------|---------|
| AadhaarUnverified | Identity | Aadhaar verification API |
| ConflictOfInterest | Matrimonial | External relationship graph / KYC |
| IncomeInconsistency | Financial | ITR/income verification service |
| PANDiscrepancy | Identity | PAN verification API (NSDL/UTIITSL) |
| UndisclosedExistingMarriage | Matrimonial | Marriage registry / KYC verification |
