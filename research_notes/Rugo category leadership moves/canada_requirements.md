# Canadian Regulatory and Market Requirements for Trucking Software (Ontario and Québec focus, 2024–2026)

Research method note: about 20 web searches, done 2026-11-17. The fetch tool could not resolve tc.canada.ca, which is blocked by the session's network allowlist. As a result, Transport Canada primary pages (the ELD Q&A and the certified-ELD list) could not be read directly. Findings on those points come from search snippets of trade press and of provincial or legal sources. Every claim below has a URL. Search-tool summaries were checked against the source titles and dates. Anything unconfirmed is listed under Gaps.

## 1. Federal ELD mandate, provincial enforcement and Canadian HOS rules

### Takeaway
Canada's federal ELD mandate has been fully enforced since January 1, 2023, after a progressive-enforcement year in 2022. Unlike the US, devices must be certified by an accredited third party. Ontario and Québec both enforce ELDs on intra-provincial carriers: Ontario through O. Reg. 555/06 and Québec since April 30, 2023. Canadian HOS rules (13 h driving, 14 h on-duty, 16 h elapsed; Cycle 1 of 70 h in 7 days or Cycle 2 of 120 h in 14 days) need a separate rules engine from the US 11/14/60-70 rules.

### Cited Findings
- **Federal timeline:** Enforcement of the federal ELD rule for extra-provincial (federally regulated) carriers began in full on Jan 1, 2023, ending a "progressive enforcement" period (education, no penalties) that started in June 2022. Sources: [FleetOwner – Canadian ELD mandate under full enforcement](https://www.fleetowner.com/technology/article/21257323/canadian-eld-mandate-under-full-enforcement); [Truck News – Federal ELD mandate now enforced in most areas of Canada](https://www.trucknews.com/english/federal-eld-mandate-now-enforced-in-most-areas-of-canada); [Isaac – Understanding progressive enforcement](https://www.isaacinstruments.com/compliance-regulation/understanding-the-canadian-eld-mandates-progressive-enforcement/).
- **Third-party certification:** Transport Canada requires accredited third-party certification of ELDs. FMCSA in the US allows self-certification. Canada introduced the third-party process "to limit potential tampering with Hours-of-Service data." Source: [Truck News – When is a decertified ELD not a decertified ELD?](https://www.trucknews.com/regulations/when-is-a-decertified-eld-not-a-decertified-eld/1003182389).
- **Certification bodies:** Transport Canada originally accredited three bodies: FPInnovations, COMDriver Tech and CSA Group. CSA Group later withdrew voluntarily, and its devices moved to the remaining bodies. For example, certification number 3A28 (CSA) became 1F41 (FPInnovations). Transport Canada also keeps a "No Longer Certified" list. Sources: [Truck News – decertified ELD](https://www.trucknews.com/regulations/when-is-a-decertified-eld-not-a-decertified-eld/1003182389); [HDT – Canada adds third ELD certification body](https://www.truckinginfo.com/news/canada-adds-third-eld-certification-body); [FPInnovations certification](https://web.fpinnovations.ca/certification/).
- **Certification is required for US fleets too:** Isaac renewed its Canadian ELD certification in October 2025. It notes that third-party certification is required for every ELD used in Canada, including those of US fleets crossing the border. Isaac also claims its platform is used by 30% of Canadian carriers (vendor claim). Source: [Isaac – renews certification of its ELD in Canada](https://www.isaacinstruments.com/news/isaac-renews-certification-of-its-eld-in-canada).
- **Technical standard update:** One vendor blog reports a 2025 update to the CCMTA ELD technical standard (v1.3), with a Transport Canada transition period for vendors and certifiers. This is unverified against a primary source. Sources: [Whip Around – Canadian ELD mandate](https://whiparound.com/blog/canadian-eld-mandate/); see also [CCMTA – Canadian ELD standard](https://ccmta.ca/en/canadian-eld-standard).
- **Québec:** Québec delayed enforcement twice. Its date moved to June 1, 2023, then forward to April 30, 2023, when Québec began fully enforcing the ELD mandate "for all carriers operating in the province", including intra-provincial carriers. Enforcement required amendments to Québec's Highway Safety Code. Sources: [Miller Thomson – ELD enforcement to begin in Québec April 30, 2023](https://www.millerthomson.com/en/insights/transportation-and-logistics/eld-enforcement-begin-quebec-april-30-2023-motor-carriers/); [Truck News – Québec ELD mandate to be enforced April 30](https://www.trucknews.com/transportation/quebec-eld-mandate-to-be-enforced-april-30/1003172133); [Truck News – Québec won't enforce in June](https://www.trucknews.com/regulations/breaking-quebec-wont-enforce-eld-mandate-in-june/1003149212).
- **Ontario:**
  - Ontario enforced the mandate from Jan 1, 2023 for federally regulated carriers. It also amended O. Reg. 555/06 (Hours of Service, Highway Traffic Act) so that carriers operating only in Ontario must use ELDs, harmonized with the federal rules plus Ontario-specific exemptions (for example school buses and driveaway/tow). Sources: [Miller Thomson/Mondaq – Proposed amendments for Ontario carriers](https://www.mondaq.com/canada/rail-road-cycling/1083842/proposed-amendments-to-adopt-mandatory-electronic-logging-devices-for-ontario-carriers); [O. Reg. 555/06 on e-Laws](https://www.ontario.ca/laws/regulation/060555/v21).
  - The Ontario Federation of Agriculture (Feb 2023) says most Ontario CMV drivers who must keep daily logs need an ELD, with fines of $250–$20,000. Source: [OFA fact sheet](https://ofa.on.ca/wp-content/uploads/2023/02/OFA-Fact-Sheet-Hours-of-Service-HoS-and-Electronic-Logging-Devices-ELDs.pdf).
- **Other provinces (intra-provincial):** Treatment varies:
  - Manitoba requires ELDs for both extra- and intra-provincial carriers.
  - Nova Scotia does not require them for intra-provincial carriers.
  - PEI's intra-provincial rule is effectively moot (the province is under 160 km across).
  - Sources: [J.J. Keller – ELD mandate enforcement by province](https://jjkellercompliancenetwork.com/regsense/eld-mandate-enforcement-by-province); [Overdrive – Canadian ELD mandate intra-provincial, two notable exceptions](https://www.overdriveonline.com/electronic-logging-devices/article/15634363/canadian-eld-mandate-in-play-for-most-inprovinceonly-truckers); [BigRoad – jurisdictional enforcement](https://bigroad.com/safety-corner/canadian-jurisdictional-enforcement-of-electronic-logging-devices/).
- **Canadian HOS rules (federal, mirrored by the provinces):**
  - Daily limits: 13 h driving and 14 h on-duty per day. A 16 h elapsed-time limit per shift applies, followed by 8 consecutive hours off duty.
  - Cycle 1 is 70 h in 7 days, with a 36 h reset. Cycle 2 is 120 h in 14 days, with a 72 h reset and a mandatory 24 h off after 70 h on-duty.
  - Switching from Cycle 1 to Cycle 2 needs 36 h off; switching from Cycle 2 to Cycle 1 needs 72 h off. Cycles are rolling windows.
  - Sources: [SAAQ – Driving and off-duty time](https://saaq.gouv.qc.ca/en/transportation-goods/driving-and-off-duty-time-driver); [Manitoba – General rules for HOS](https://www.gov.mb.ca/mti/mcd/carriers_drivers/hours.html); [Isaac – Understanding HOS in Canada](https://www.isaacinstruments.com/compliance-regulation/understanding-hours-of-service-in-canada/); [BC CVSE HOS rules PDF](https://www.cvse.ca/national_safety_code/pdf/HOS_Service_Rules.pdf).
  - North of the 60th parallel, different cycle limits apply (for example, 80 h/7 days). Source: [J.J. Keller – Canadian HOS](https://jjkellercompliancenetwork.com/regsense/canadian-hours-of-service).

### Inferences
- A credible platform must run separate Canadian and US HOS engines and switch rulesets automatically at the border. That includes Canadian Cycle 1/2 switching, deferral of off-duty time, and the 16 h elapsed rule.
- "Certified for Canada" (listed by FPInnovations or COMDriver) is a hard procurement gate. A TMS that is not itself an ELD must integrate with Canadian-certified ELDs (Isaac, Geotab partners, Samsara and others) rather than build its own.
- Ontario and Québec both apply ELDs to in-province carriers, so the addressable "ELD-required" fleet in the two largest provinces includes local and regional haulers, not only long-haul.

### Gaps
- tc.canada.ca was unreachable, so the current certified-ELD count and the status of the v1.3 standard transition could not be verified from the primary source.
- No 2025–2026 change to Ontario or Québec ELD enforcement was found. The exact in-force date of Ontario's intra-provincial mandate was not confirmed from the primary source.
- Alberta and BC intra-provincial status was not confirmed in this pass. The J.J. Keller table covers it but could not be fully read.

## 2. Ontario CVOR and the Québec equivalent (PECVL / CTQ register)

### Takeaway
Ontario's CVOR scores carriers on a violation rate made of collision, conviction and inspection points, measured against fleet-size-based thresholds. Facility audits feed the safety rating (Excellent, Satisfactory, Conditional, Unsatisfactory). Québec carriers must register in the CTQ's Registre des propriétaires et des exploitants de véhicules lourds (Loi PECVL). Their behaviour is evaluated under a SAAQ/CTQ evaluation policy that can lead to a downgraded safety rating ("cote de sécurité"). Software needs to mirror these scores so carriers can see their risk ahead of time.

### Cited Findings
- **Current CVOR framework:** The MTO "CVOR Program – Carrier Safety Module reference guide", dated 2026-04-20, describes the current framework. Source: [ontario.ca PDF](https://www.ontario.ca/files/2026-04/mto-cvor-program-carrier-safety-module-reference-guide-en-2026-04-20.pdf).
- **CVOR rating thresholds:** These are from the 2026 MTO guide, as relayed by search.
  - **Excellent:** requires at least 24 months of Ontario operation, an overall violation rate at or below 15% of threshold, a collision rate at or below 10%, and an excellent facility audit. To keep the rating, the rates must stay at or below 20% (overall) and 15% (collision).
  - **Unsatisfactory:** above 100% of threshold, the Deputy Registrar may impose sanctions and an Unsatisfactory rating.
  - **Unaudited carriers:** rated on their overall violation rate.
  - Source: [MTO CVOR reference guide 2026](https://www.ontario.ca/files/2026-04/mto-cvor-program-carrier-safety-module-reference-guide-en-2026-04-20.pdf).
- **CVOR points and audits:** CVOR points from collisions and convictions are weighted roughly twice as heavily as inspection points, according to a law-firm analysis. Carriers can request a voluntary facility audit to improve their rating (cvor@ontario.ca). Sources: [MTO CVOR reference guide 2026](https://www.ontario.ca/files/2026-04/mto-cvor-program-carrier-safety-module-reference-guide-en-2026-04-20.pdf); [CVOR page on ontario.ca](https://Ontario.ca/page/commercial-vehicle-operators-registration-cvor).
- **New CVOR application process:** Ontario introduced a new CVOR application process, covered by legal commentary. Source: [Mondaq – Navigating Ontario's new CVOR application process](https://www.mondaq.com/canada/rail-road-cycling/1579448/navigating-ontarios-new-cvor-application-process-what-commercial-vehicle-operators-need-to-know).
- **Ontario Bill 56 (2025):** Bill 56, which received Royal Assent on Nov 14, 2025, expands automated-enforcement offences. These affect commercial carriers, for example camera-based tickets attributed to the owner/carrier. Sources: [Gowling/GRLLP – Lights, Camera, Infractions](https://grllp.com/blog/Lights--Camera-Infractions-A-Review-of-Ontario%E2%80%99s-Automatic-Enforcement-System-Offence-Regime--the-Risks-to-Commercial-Vehicle-Carriers-and-How-Operators-Can-Protect-Themselves-909); [Mondaq version](https://www.mondaq.com/canada/rail-road-cycling/1810702/lights-camera-infractions-a-review-of-ontarios-automatic-enforcement-system-offence-regime-the-risks-to-commercial-vehicle-carriers-and-how-operators-can-protect-themselves).
- **New MTO enforcement powers:** OTA reported that proposed legislation would give MTO enforcement new powers and flexibility. Source: [OTA – Proposed legislation will give new powers to MTO enforcement](https://ontruck.org/proposed-legislation-will-give-new-powers-and-flexibility-to-mto-enforcement/).
- **Québec register:** Owners and operators of heavy vehicles must register in the Registre des propriétaires et des exploitants de véhicules lourds, kept by the Commission des transports du Québec (CTQ) under the Loi concernant les propriétaires, les exploitants et les conducteurs de véhicules lourds (Loi PECVL, formerly PEVL), before they may operate. Sources: [SAAQ – Register of owners and operators](https://saaq.gouv.qc.ca/en/transportation-goods/register-owners-operators); [MTQ – Guide PECVL](https://www.transports.gouv.qc.ca/fr/entreprises-partenaires/ent-camionnage/loi-vehicules-lourds/Documents/Guide-PECVL.pdf); [LégisQuébec P-30.3](https://www.legisquebec.gouv.qc.ca/en/document/cs/P-30.3%20/20230430).
- **Québec safety rating:** The CTQ assigns a safety rating ("cote de sécurité"). An unaudited registrant receives "satisfaisant" marked "non audité". The implementing regulation is current to Oct 24, 2025. Source: [LégisQuébec P-30.3, r. 1](https://www.legisquebec.gouv.qc.ca/en/document/cr/p-30.3,%20r.%201).
- **Québec evaluation policy:** Owner and operator behaviour is evaluated under the "Politique d'évaluation des propriétaires et exploitants", which can lead to corrective measures or sanctions. Source: [SAAQ – répertoire des intervenants](https://saaq.gouv.qc.ca/blob/saaq/documents/images/vignette-publications/fr/repertoire-intervenants.pdf).

### Inferences
- Credible features for Canada:
  - A CVOR abstract tracker that ingests inspections, convictions and collisions and projects the violation rate against the threshold, with alerts at 15/20/35/50/70/85/100%.
  - A Québec PEVL/CTQ "dossier de comportement" tracker.
  - Carrier-of-record lookups (CVOR number, NSC number, CTQ/RIN number) for vetting brokers and shippers.
- US-built tools center on CSA/BASIC and FMCSA SMS scores and mostly ignore CVOR and PEVL. This is a white space for a Canada-first product. It is inferred: no source was found that says so explicitly.

### Gaps
- The exact CVOR threshold calculation (kilometres-based, fleet-size bands) and the 2025–2026 point-value changes were not retrieved in full.
- The detailed SAAQ/CTQ evaluation thresholds (point limits by fleet size) were not found.

## 3. NSC standards relevant to software (Std 13, Std 15, driver files, maintenance)

### Takeaway
NSC Standard 13 (trip inspection) and NSC Standard 15 (facility audit) set what records a Canadian carrier must keep and produce at audit. That covers driver files, HOS (6 months), trip inspections, maintenance files and accident records. The exact retention periods in Standard 13 vary by source, so a platform should set its defaults to the longest applicable period.

### Cited Findings
- **Standard 15 audit scope:** Auditors look at records on drivers, hours of service and other areas. HOS records for the previous 6 months are an audit item. The sample size for driver and vehicle files scales with fleet size (for example, a minimum of 6 files for a 6–9 vehicle fleet). Sources: [Manitoba – Facility audits & investigations guide](https://web40.gov.mb.ca/mti/mcd/carriers_drivers/pdf/guide/facility_audits_investigations.pdf); [CCMTA – NSC Standard 15 PDF](https://www.ccmta.ca/web/default/files/PDF/Standard_15.pdf).
- **Standard 15 record preservation:** Standard 15 has a "Preservation of Records" section, and it is used as the guideline for driver qualification files. Sources: [CCMTA Standard 15](https://www.ccmta.ca/web/default/files/PDF/Standard_15.pdf); [J.J. Keller – NSC facility audits](https://jjkellercompliancenetwork.com/regsense/national-safety-code-facility-audits).
- **Trip inspection reports:** BC's NSC course says carriers must get trip inspection reports from drivers within 20 days and keep them on file. One source gives 3 months, while others commonly cite 6 months. This is a conflict to verify. Source: [BC CVSE NSC course – Keeping trip inspection reports](https://www.cvse.ca/NSC-Course/mod4/m4_0016.html).

### Inferences
- Must-haves:
  - A digital Schedule 1/Schedule 2 trip inspection (DVIR equivalent) with Canadian defect lists split into major and minor defects.
  - Driver files: abstracts, licence class, medicals, and Québec-specific items.
  - Maintenance files per unit, with periodic inspection (PMVI/SAAQ "vérification mécanique") due-date tracking.
  - An "audit binder" export in Standard 15 format.

### Gaps
- The actual Standard 13 Schedule 1 retention period could not be confirmed. The CCMTA site was not fetched.
- The Ontario-specific (PMVI) and Québec-specific (PEP) periodic inspection rules were not researched in this pass.

## 4. IFTA/IRP, fuel taxes and 2025 carbon charge changes

### Takeaway
The biggest 2025 change was the elimination of the federal fuel charge (carbon price) from April 1, 2025. Carriers registered as fuel-charge "road carriers" filed a final quarter (Jan–Mar 2025, due Apr 30, 2025), and those registrations were cancelled effective Nov 1, 2025. IFTA and IRP remain the core quarterly and annual workflows. Québec keeps its cap-and-trade system, which is embedded in fuel prices rather than in a separate carrier filing.

### Cited Findings
- **Carbon charge removed:** The federal fuel charge was reduced to zero from April 1, 2025, and the requirement for provinces to keep a consumer carbon price was removed. Source: [Department of Finance – Removing the consumer carbon price, effective April 1, 2025](https://www.canada.ca/en/department-finance/news/2025/03/removing-the-consumer-carbon-price-effective-april-1-2025.html).
- **Final filings:** Registered road carriers file quarterly, so their final return covered Jan 1–Mar 31, 2025 and was due Apr 30, 2025. Exemption certificates stopped applying to deliveries on or after Apr 1, 2025. Source: [EY Global Tax News 2025-0728](https://globaltaxnews.ey.com/news/2025-0728).
- **Registrations cancelled:** Fuel charge registrations were cancelled effective Nov 1, 2025. Source: [EY Canada Tax Alert 2025 No. 17](https://www.ey.com/en_ca/technical/tax/tax-alerts/2025/tax-alert-2025-no-17). See also [KPMG – Elimination of federal fuel charge](https://kpmg.com/us/en/taxnewsflash/news/2025/04/canada-elimination-federal-fuel-charge-april-1-2025.html).
- **Legislative repeal:** The consumer carbon price was later removed from Canadian law, and CRA can still reassess pre-April 2025 periods. Source: [Finance Canada – Removing the consumer carbon price from Canadian law (May 2025)](https://www.canada.ca/en/department-finance/news/2025/05/removing-the-consumer-carbon-price-from-canadian-law.html).
- **Industry guidance:** OTA circulated the official federal guidance to carriers. Source: [OTA – Official Fed Govt guidance on removing carbon tax](https://ontruck.org/official-fed-govt-guidance-on-removing-carbon-tax-april-1/).

### Inferences
- Fuel-tax software for Canadian fleets must:
  - keep historical fuel-charge data for reassessments;
  - compute IFTA by jurisdiction, including all 10 provinces (the territories are not IFTA members);
  - handle the large fuel price and tax differences that arose after April 2025;
  - handle Québec's distinct fuel tax rates.
- The removal of the carbon charge likely reduced fuel-surcharge baselines. Rate tables and fuel surcharge (FSC) indexes tied to NRCan or Kalibrate prices need resetting. This is an inference.

### Gaps
- No source was found on how IFTA jurisdictions treated the carbon-charge change in IFTA tax-rate matrices, or on any 2025–2026 changes to IRP or IFTA for Canadian base jurisdictions.
- Whether the Québec cap-and-trade system was affected in 2025 was not researched.

## 5. Cross-border: ACI eManifest, ACE, CARM, PARS/PAPS, FAST and 2025 tariffs

### Takeaway
Northbound highway carriers must send ACI eManifest cargo and conveyance data to CBSA at least 1 hour before arrival, under a CBSA carrier code. Separately, the broker or importer handles release, typically through PARS. CARM went live for external users on October 21, 2024. It moved duty and tax accounting, and the posting of financial security, from brokers to importers, but it did not change the release process. The 2025 US–Canada tariff war disrupted southbound freight: about 70% of CTA carriers had US loads cancelled or paused (April 2025). East–west domestic freight has grown relative to north–south.

### Cited Findings
- **ACI eManifest rules:**
  - Highway cargo data is due to CBSA 1 hour before arrival.
  - The cargo control number (CCN) is the carrier code plus a unique reference, with no spaces.
  - On brokered or subcontracted loads, the primary carrier sends the cargo data and the secondary carrier sends the conveyance data, quoting the primary carrier's CCNs.
  - eManifest is in addition to the release data that the importer or broker files.
  - CBSA Memorandum D3-4-2 was updated Nov 12, 2025.
  - Sources: [CBSA Memorandum D3-4-2](https://cbsa-asfc.gc.ca/publications/dm-md/d3/d3-4-2-eng.html); [CBSA – Reporting requirements for commercial carriers](https://www.cbsa.gc.ca/prog/aci-manif-ipec/menu-eng.html); [CBSA ECCRD – highway](https://www.cbsa-asfc.gc.ca/prog/manif/eccrdhi-deccerout-eng.html).
- **PARS:** PARS (Pre-Arrival Review System) is the default commercial release type. The broker submits release data that quotes the carrier's CCN. Sources: [PCB – ACI eManifest best practices](https://www.pcb.ca/post/aci-emanifest-best-practices-for-processing-your-highway-shipments-7627); [BorderConnect – ACI eManifest requirements](https://borderconnect.com/aci-e-manifest/aci-emanifest-requirements.htm).
- **CARM go-live:** CARM was delayed from May 13, 2024 to October 2024. It launched to external clients (importers, brokers) on Oct 21, 2024. Sources: [EY – CARM Release 2 delayed to October 2024](https://globaltaxnews.ey.com/news/2024-0892-canada-delays-implementation-of-cbsa-assessment-and-revenue-management-carm-project-release-2-to-october-2024); [Willson – Customs Notice 24-17](https://www.willsonintl.com/news/customs-notice-24-17-carm-launch-to-external-clients-rescheduled-to-october-2024/); [CBSA – CARM](https://www.cbsa-asfc.gc.ca/services/carm-gcra/menu-eng.html).
- **CARM impacts:**
  - Release processing stays with the broker.
  - Importers must have a CARM Client Portal account and post their own financial security, with a 180-day transition for registrants. Brokers can no longer use their own security for clients.
  - CBSA used penalty discretion for the period Sep 1–Oct 20, 2024.
  - Sources: [PwC Canada – CARM October 2024 update](https://www.pwc.com/ca/en/services/tax/publications/tax-insights/businesses-importing-goods-canada-register-CARM-oct-update-2024.html); [C.H. Robinson – CARM](https://www.chrobinson.com/en-us/resources/carm/).
- **2025 tariff impact:**
  - In the CTA's April 2025 survey, almost 70% of carriers said US-bound loads (lumber, oil products, fertilizer, farm equipment, tires, food) had been cancelled or halted. 60% said a prolonged trade war could seriously threaten their operations. Only 8% had laid off staff, and 70% saw no northbound impact.
  - Sources: [OTA/CTA – 70% of carriers see freight drop](https://ontruck.org/70-of-carriers-see-freight-drop-further-tariffs-could-be-breaking-point-cta-survey/); [Truck News – Tariff threats cause surges, cancellations](https://www.trucknews.com/supply-chain/tariff-threats-cause-shipment-surges-cancellations-delays-cta-warns-of-chaos/1003194987); [Truck News – Truckers scramble for new routes](https://www.trucknews.com/business-management/truckers-scramble-for-new-routes-as-tariffs-bring-shipments-to-a-halt/1003194659); [FreightWaves – "Nuclear winter" may hit Canada-US freight](https://www.freightwaves.com/news/canadian-trucking-group-nuclear-winter-may-hit-canada-us-freight).
- **2026 status:**
  - US–Canada trade talks collapsed, and cross-border truck volumes were "somewhat lower throughout 2026."
  - Canada-to-US spot rates spiked by up to 75% in some lanes during pre-tariff front-loading.
  - An analyst noted that traditional north–south hauls are shrinking while intra-Canadian east–west moves grow.
  - Note that the search tool's dating for these items was inconsistent.
  - Sources: [FreightWaves – US-Canada supply chains face uncertainty as talks collapse](https://www.freightwaves.com/news/us-canada-supply-chains-face-uncertainty-as-trade-talks-collapse); [FreightWaves – USMCA deadlock](https://freightwaves.com/news/usmca-deadlock-canada-bans-what-it-means-for-trucking); [C.H. Robinson – Oct 2026 cross-border update](https://www.chrobinson.com/en-us/resources/insights-and-advisories/north-america-freight-insights/oct-2026-freight-market-update/cross-border/).
- **BC slowdown:** BCTA published a report on the slowdown in BC cross-border trucking. Source: [BCTA – report on BC cross-border slowdown](https://bctrucking.com/bcta-report-examines-bcs-cross-border-trucking-slowdown/).

### Inferences
- Credible cross-border support needs:
  - native ACI (CBSA) and ACE (CBP) eManifest filing, or tight integration with BorderConnect/PCB-type providers;
  - automatic generation of PARS/PAPS barcode labels and CCNs from the load record;
  - broker hand-off (sending the CCN and commercial invoice to the customs broker);
  - FAST/C-TPAT/PIP driver and carrier flags;
  - a carrier-code registry for interline loads.
- The tariff disruption creates software needs:
  - fast lane re-planning toward domestic east–west freight;
  - per-commodity tariff exposure dashboards for shippers;
  - rate volatility tooling.
- CARM moved the security burden to importers, so shipper-side tools that track CARM readiness (BN15, Release Prior to Payment security) are relevant to platforms serving shippers.

### Gaps
- No source was retrieved on PAPS mechanics, CBP ACE eManifest 2025 changes, or FAST program changes or suspensions in 2025–2026.
- Exact 2025–2026 US Section 232 tariff rates on Canadian goods or on trucks were not verified.

## 6. Québec Charter of the French Language / Bill 96

### Takeaway
Bill 96 (Royal Assent June 1, 2022) phased in obligations, and the final major provisions took effect June 1, 2025. Francization now applies to employers with 25+ employees, down from 50. Software used in the workplace must be offered in French when a French version exists. Customer-facing products, contracts of adhesion and documentation must be available in French. Interprovincial (federally regulated) trucking firms operating in Québec have no blanket exemption.

### Cited Findings
- **Final provisions:** The last obligations came into force on June 1, 2025, including extended francization to businesses with 25–99 employees and stricter rules on product inscriptions and trademarks. Sources: [TransPerfect – Bill 96 key changes in 2025](https://www.transperfect.com/blog/quebecs-bill-96-key-changes-2025); [Mondaq – Employer obligations coming into force June 1, 2025](https://webiis08.mondaq.com/canada/employee-rights-labour-relations/1628454/employer-obligations-under-the-charter-of-the-french-language-coming-into-force-on-june-1-2025); [Mondaq – Québec's French language requirements for commerce](https://www.mondaq.com/canada/trademark/1626508/quebecs-french-language-requirements-for-commerce-and-business-reform-of-the-charter-of-the-french-language).
- **Workplace software:** Where software has a French version, employers must provide it in French. Where none exists, there is no obligation to create one. Day-to-day communications, software interfaces and training should be available in French. Sources: [Argos Multilingual – What Bill 96 means](https://www.argosmultilingual.com/blog/what-quebecs-bill-96-means-for-translation-and-compliance); [Crowe BGK – Québec's Bill 96](https://www.crowe.com/ca/crowebgk/insights/quebecs-bill-96); [Gowling WLG – Bill 96 impacts](https://gowlingwlg.com/en/insights-resources/articles/2022/quebec-bill-96-impacts-and-key-considerations).
- **Contracts of adhesion:** Since June 1, 2023, contracts of adhesion (standard-form contracts, such as SaaS terms) must be presented in French first before parties can choose another language. Source: [McCarthy Tétrault – language obligations](https://mccarthy.ca/en/dbic-language).
- **No exemption for trucking:** Federally regulated businesses, including interprovincial trucking, have no blanket exemption from Bill 96 in Québec. This comes from a secondary legal blog. Source: [SiLaw – Bill 96 Québec 2026](https://silaws.com/bill-96-loi-96-quebec-2026-en/).
- **Penalties:** Fines are cited at $3,000–$30,000 per day for companies, doubled or tripled for repeat offences. This figure comes from a vendor, so treat it with caution. Source: [RWS – Bill 96 compliance clock](https://www.rws.com/blog/bill-96-compliance-clock-is-ticking).

### Inferences
- To be sellable to Québec carriers with 25+ employees, a platform needs:
  - a full French UI, including driver mobile apps;
  - French contracts and terms, presented in French first;
  - French documentation, support and training.
- Generated documents such as BOLs, invoices and rate confirmations should be bilingual or in the user's chosen language. Québec-specific terms (connaissement, lettre de voiture) and SAAQ forms should be supported.
- US vendors with partial machine translation are at a disadvantage. Isaac (Québec-based) is the incumbent with native French. This is inferred from Isaac's Québec headquarters, not from a comparative review.

### Gaps
- No OQLF guidance specific to trucking software or ELD/telematics interfaces was found.
- The exact current fine amounts were not confirmed from the statute text.

## 7. Canadian market size, driver supply, Driver Inc. and Ontario/Québec issues

### Takeaway
Canada's trucking and logistics workforce was a record 790,000+ in 2024 (THRC). Driver vacancies eased through 2025: a 3.5% vacancy rate in Q1 2025, down from 4.6%, with a slight uptick to 3.9% (13,310 vacancies) in Q1 2026. The market is dominated by small carriers. The latest StatCan fleet-size proxy is old, but about 63% of for-hire carriers had under $1M revenue in 2005, alongside about 36,000 owner-operators. "Driver Inc." misclassification is a major 2025–2026 federal enforcement priority, concentrated in the Greater Toronto and Hamilton Area (GTHA).

### Cited Findings
- **Workforce:** The trucking and logistics workforce exceeded 790,000 in 2024, a record. Source: [Truck News – Trucking employed more than 790,000 people in 2024](https://www.trucknews.com/transportation/trucking-employed-more-than-790000-people-in-2024-thrc/1003194162).
- **Vacancies:**
  - The truck driver vacancy rate was 3.5% in Q1 2025, down from 4.6% in Q1 2024. Source: [THRC – National job vacancy update Q1 2025](https://truckinghr.com/wp-content/uploads/2025/07/National-Job-Vacancy-update-Q1-2025.pdf).
  - Vacancies kept falling through Q3 2025 but remain above the national average. Source: [THRC – Trucking job openings continue to cool (Dec 2025)](https://truckinghr.com/2025/12/19/trucking-job-openings-continue-to-cool-as-hiring-slows-in-q3-2025/).
  - Q1 2026 showed 13,310 vacancies at a 3.9% rate. Source: [THRC labour tracker](https://truckinghr.com/labour-market-information/labour-market-information-snapshot/).
- **Small carriers (old data):**
  - In 2005 there were 7,067 small for-hire carriers (revenue $30K–$1M), 63% of for-hire carriers. Source: [StatCan – Results of the Annual Survey of Small For-hire Carriers and Owner Operators](https://www150.statcan.gc.ca/n1/pub/50-002-x/50-002-x2010006-eng.htm).
  - About 36,000 owner-operators were counted in 2003–2004. Sources: [StatCan 50-002-X](https://publications.gc.ca/collections/collection_2010/statcan/50-002-X/50-002-x2010006-eng.pdf); [StatCan trucking industry subject page](https://www150.statcan.gc.ca/n1/en/subjects/transportation/road_transportation/trucking_industry?p=3-All).
- **Driver Inc. (Budget 2025):**
  - Budget 2025 commits $77M over four years starting in 2026–27, plus $19.2M a year ongoing, for CRA to address Driver Inc.
  - It lifts the moratorium on T4A reporting for independent contractors.
  - It allows CRA–ESDC information sharing, which requires amendments to the Income Tax Act and Excise Tax Act.
  - Sources: [Truck News – Federal budget follows through on driver misclassification](https://www.trucknews.com/business-management/federal-budget-follows-through-on-promises-related-to-driver-misclassification/1003203961); [Truck News – Budget promises to lift T4A moratorium](https://www.trucknews.com/regulations/federal-budget-promises-to-lift-t4a-moratorium-in-bid-to-stamp-out-driver-inc/1003203703); [Inside Logistics – Government to fund effort to eliminate Driver Inc](https://www.insidelogistics.ca/transportation/trucking/government-to-fund-effort-to-eliminate-driver-inc/).
- **GTHA enforcement:** Jobs Minister Patty Hajdu announced an enforcement blitz in the GTHA targeting Driver Inc. The CTA welcomed the measures, and the Insurance Bureau of Canada (IBC) endorsed them. The budget vote secured the path to CRA and ESDC enforcement. Sources: [Truck News – Canadian trucking reacts, jobs minister gives details](https://www.trucknews.com/regulations/canadian-trucking-reacts-to-promised-crackdown-on-driver-misclassification-jobs-minister-gives-more-details/1003203739); [OTA – Budget vote secures path to Driver Inc enforcement](https://ontruck.org/budget-vote-secures-path-to-driver-inc-enforcement-through-cra-esdc/); [Insurance Business – IBC applauds crackdown](https://www.insurancebusinessmag.com/ca/news/breaking-news/ibc-applauds-federal-crackdown-on-trucking-fraud-555016.aspx).

### Inferences
- The long tail of small fleets and owner-operators in Ontario (GTHA) and Québec needs low-cost, mobile-first, bilingual tools, including Punjabi-language support for the GTHA driver base. Punjabi is an inference and was not sourced here.
- Driver Inc. enforcement creates demand for:
  - clean T4/T4A payroll and settlement workflows;
  - employee-versus-contractor classification checks;
  - CRA-ready records (payroll remittances, CPP/EI) in driver pay modules.
- This is a differentiator against US TMSs built around 1099 contractor settlements.

### Gaps
- No current (2023–2026) StatCan count of for-hire carriers by fleet size was found. The most recent sourced data is from 2005. Many industry sources say most Canadian carriers run fewer than 10 trucks, but none was sourced here.
- No Ontario- or Québec-specific carrier counts were retrieved, for example from the CVOR registry or CTQ register.

## 8. Canadian or Canada-strong TMS and fleet vendors, and reported gaps

### Takeaway
The Canada-based leaders are Rose Rocket (Toronto, network TMS), Isaac Instruments (Québec, ELD/telematics), Geotab (Oakville, telematics), Descartes (Waterloo, customs filing and eManifest), and PCB/BorderConnect (eManifest). This pass found little primary evidence of user-reported gaps. The most defensible gap thesis is structural: few US-built TMSs handle CVOR/PEVL, Canadian HOS, ACI eManifest, GST/HST/QST and Bill 96 French together.

### Cited Findings
- **Rose Rocket:**
  - Toronto-based. Raised a $38M USD Series B in June 2023, led by Scale Venture Partners, after a $25M USD (about $31M CAD) Series A.
  - Launched "TMS.ai" in early 2025 and acquired Toronto-based Centro (email-to-structured-data) in September 2025, according to search summaries.
  - Customer counts conflict between aggregators (1,200 versus 10K+) and are unverified.
  - Sources: [BusinessWire – Rose Rocket $38M Series B](https://www.businesswire.com/news/home/20230620643042/en/Rose-Rocket-Raises-%2438M-USD-Series-B-to-Scale-its-Network-Centric-TMS-Solutions-while-Expanding-into-the-Enterprise); [BetaKit – Rose Rocket raises $31M CAD](https://betakit.com/?p=314121); [CB Insights – Rose Rocket](https://www.cbinsights.com/company/rose-rocket).
- **Isaac Instruments:**
  - Headquartered in Saint-Bruno-de-Montarville, Québec.
  - Renewed its Canadian ELD certification in October 2025 and claims 30% of Canadian carriers (vendor claim).
  - Signed an agreement with Daimler Truck North America on Dec 3, 2025, to use embedded telematics on Freightliner and Western Star trucks.
  - Is a McLeod-certified integration partner.
  - Sources: [Isaac – renews certification](https://www.isaacinstruments.com/news/isaac-renews-certification-of-its-eld-in-canada); [Isaac – Daimler partnership](https://www.isaacinstruments.com/news/isaac-daimler-partnership/); [Fleet Equipment – Isaac McLeod partner](https://www.fleetequipmentmag.com/isaac-mcleod-software-certified-integration-partner/); [FleetOwner – Eassons selects Isaac (300 trucks)](https://www.fleetowner.com/refrigerated-transporter/reefer-operations/article/55089135/canadian-reefer-carrier-selects-isaac-telematics).
- **eManifest service providers:** BorderConnect and PCB are established ACI/ACE eManifest providers used by Canadian carriers. Sources: [BorderConnect](https://borderconnect.com/aci-e-manifest/aci-emanifest-requirements.htm); [PCB](https://www.pcb.ca/post/aci-emanifest-highway-carrier-implementation-3307).
- **Language coverage example:** One example of the language gap is MyCarrierTMS, which Capterra lists as English-only and available in Canada and the US. Source: [Capterra.ca FR – MyCarrier](https://fr.capterra.ca/software/1021910/mycarrier).

### Inferences
- Opportunities for a Canada-first TMS:
  - CVOR and PEVL score tracking built in.
  - Bilingual French/English by default, Bill 96-ready, covering driver app, documents and contracts.
  - Native GST/HST/QST freight tax logic, including continuous freight movement zero-rating.
  - ACI eManifest built in, plus PARS/PAPS and CCN generation.
  - Canadian HOS-aware dispatch, meaning load planning that respects the 13/14/16 limits and Cycle 1/2 availability.
  - CAD/USD dual-currency invoicing and settlements.
  - T4/T4A-compliant driver pay.
  - Canadian fuel cards and factoring integrations.
  - Domestic east–west lane tools as cross-border volumes shift.
- Isaac (telematics/ELD) and Rose Rocket (TMS) are the natural integration partners or competitors. Trimble TMW and McLeod (US) dominate large fleets. This is inferred and was not verified this pass.

### Gaps
- No user-review evidence (G2, Capterra, forums) on Canadian-specific gaps in Rose Rocket, TMW, McLeod, Samsara or Motive was retrieved. That would need a follow-up.
- Geotab, Descartes and Alpega/Trimble Canadian positioning was not researched with sources this pass. The vendor search returned irrelevant results.
- Truckx: no information found.

## 9. Payment and finance: e-invoicing, GST/HST/QST on freight, factoring and fuel cards

### Takeaway
Freight services in Canada are taxed at the rate of the province where the service is supplied (GST, or HST in Ontario at 13%), or zero-rated for international and continuous outbound/inbound freight movements. QST applies only when both origin and destination are in Québec and the movement is not part of a continuous movement out of Québec or from outside Canada. Invoicing must apply these rules per leg, including for interline and subcontracted legs.

### Cited Findings
- **CRA framework:** A domestic freight service may be taxable at the provincial rate or zero-rated. International freight transportation services are generally zero-rated. "Continuous freight movement" drives zero-rating for domestic legs of international moves and for interline settlements. Sources: [CRA GST/HST Memorandum 28-2 – Freight Transportation Services](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/28-2/freight-transportation-services.html); [CRA – GST/HST information for freight carriers (RC4080)](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-specific-situations/freight-carriers.html).
- **Place of supply:** For freight, the place of supply depends on origin (where the first carrier takes possession) and the shipper-specified destination. Source: [CRA – Place of supply in a province – transportation](https://www.canada.ca/en/revenue-agency/services/forms-publications/publications/3-3-7/plc-spply-prvnc-trnsprttn.html).
- **QST rule:** Freight transportation is subject to QST when both origin and destination are in Québec, unless it is part of a continuous freight movement to a place outside Québec or from outside Canada. Sources: [Revenu Québec – Freight transportation services](https://www.revenuquebec.ca/en/businesses/consumption-taxes/gsthst-and-qst/special-cases-gsthst-and-qst/transportation-applying-the-gst-and-qst/freight-carriers/freight-transportation-services/); [Revenu Québec – Continuous outbound freight movement](https://www.revenuquebec.ca/en/definitions/continuous-outbound-freight-movement/).
- **Export declaration:** An export declaration on the bill of lading, stating the shipment forms part of a continuous outbound movement, has historically been accepted as evidence for zero-rating. This comes from older CN guidance. Source: [CN – Overview of taxes](https://www.cn.ca/-/media/Files/Customer-Centre/Shipping/OVERVIEWofTaxes2013-en).
- **Interlining:** Interlining zero-rating depends on contract structure. Sources: [VATupdate – GST/HST in Canadian interlining (Aug 2025)](https://www.vatupdate.com/2025/08/12/understanding-gst-hst-implications-in-canadian-interlining-for-transportation-and-logistics-industries/); [Truck News – Understanding GST/HST on freight](https://www.trucknews.com/blogs/understanding-gst-and-hst-taxes-on-freight-transportation-services).

### Inferences
- The invoice engine must:
  - determine tax per shipment from origin, destination and continuous-movement status;
  - apply GST 5%, HST (13% in Ontario, 15% in the Atlantic provinces) and QST 9.975%;
  - support export declarations on BOLs;
  - print GST/HST and QST registration numbers on invoices;
  - handle CAD/USD.
- Getting this wrong creates CRA and Revenu Québec audit exposure, which makes it a strong credibility signal. Standard rates are general knowledge and were not sourced here, so verify them.

### Gaps
- No sourced info was gathered on Canadian factoring companies, Canadian fuel card networks (Petro-Pass, Flying J/Pilot Canada, Esso/Imperial, Husky/Cardlock) or their APIs. A follow-up is needed.
- Canadian e-invoicing mandates: no federal B2B e-invoicing mandate was found in this pass, and none was researched. Treat it as unverified, not as confirmed absent.
- 2025–2026 changes to GST/HST rates or freight rules were not checked.
