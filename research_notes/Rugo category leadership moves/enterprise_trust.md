# Enterprise Trust, Security & Integration Requirements for TMS/Fleet Software (2024–2026), plus Freight Fraud/Cyber Trends

Research date: 2026-11-17. Method note: findings come from web search result pages and summaries; direct fetch of vanta.com was blocked in this session (host not on the allowed network list), so Vanta/Drata cost figures rely on third-party guides. Items older than 2024 are marked [OLDER]. Vendor-sourced stats (Highway, Truckstop, project44, compliance-platform vendors) have a commercial interest and are flagged.

---

## 1. Security certifications: what vendors advertise, what buyers require, cost and time

### Takeaway
The fleet/visibility leaders advertise SOC 2 Type II plus ISO 27001 (Samsara adds ISO 27017/27018/27701/42001), and that pairing is the bar a challenger is measured against in enterprise deals. TISAX is an automotive (VDA) supply-chain standard and is not a general freight requirement. A first SOC 2 Type II realistically costs about US$20k–$50k in year one (platform plus auditor) and takes about 6–14 months because of the 3–12 month observation window.

### Cited Findings
- Samsara (Mar 2024) announced four ISO certifications: ISO 27001, 27017, 27018 and 27701. ISO 27001 was certified by Schellman (ANAB/UKAS accredited) — [BusinessWire, 2024-03-07](https://www.businesswire.com/news/home/20240307949597/en/Samsara-Elevates-Data-Security-and-Privacy-Standards-with-New-Certification-Achievements)
- Samsara positions SOC 2 Type II, ISO 27001, GDPR support and regional data residency as its "verifiable compliance" story and points buyers to a Trust Center. It also reports ISO 42001 (AI management) — [Samsara blog: enterprise platform security](https://www.samsara.com/blog/samsara-enterprise-platform-security)
- A third-party directory says Samsara's trust center is Vanta-hosted at security.samsara.com. This is unverified on Samsara's own site — [trustlists.org](https://trustlists.org/company/samsara/)
- Motive announced it completed SOC 2 Type II (May 2025) and pointed buyers to its Trust Center. Its compliance programmes also include SOC 1 Type II and PCI DSS — [Motive blog, 2025-05-01](https://motivehq.com/blog/soc-2-certified)
- Motive's 2023 security overview listed ISO 27001 and SAML/OIDC SSO [OLDER] — [Motive security overview PDF (2023)](https://gomotive.com/wp-content/uploads/2023/03/security_overview_guide.pdf)
- SOC 2 Type II needs an observation period of at least 3 months, often 6–12, so the full timeline is about 6–14 months. Type I takes about 2–4 months — [Petronella Tech, 2026](https://petronellatech.com/blog/soc-2-compliance-cost-in-2026-what-startups-actually-pay); [Agency (Vanta reseller)](https://getagency.com/lp/vanta-partner)
- Vanta cost estimates (third-party): about US$11k–14k/yr for under 25 employees, about $15k–20k/yr for SOC 2 Type II, and about $24.5k for a 50-person company's "Plus" stack, plus about $12k for a CPA Type II audit — [ComplyJet Vanta pricing guide](https://complyjet.com/blog/vanta-pricing-guide-2025); [UnderDefense, 2026](https://underdefense.com/blog/vanta-pricing/); [Techplained comparison](https://www.techplained.com/best-soc2-compliance-tools)
- External SOC 2 Type II audit fees run about US$8k–25k (mid-tier firms $12k–25k) — [LowerPlane (competitor, possibly biased)](https://lowerplane-website.pages.dev/blog/how-much-does-soc-2-cost); [Tracelayer, 2026](https://tracelayer.it.com/blog/soc2-compliance-cost-2026)
- Vanta's own cost page states some audit costs are bundled with the platform. A third party says that applies only with approved partner auditors. Could not fetch to verify — [Vanta: what does a SOC 2 audit cost](https://www.vanta.com/what-does-a-soc-2-audit-cost)
- Guides commonly recommend that startups go straight to a Type II scoped to the Security criterion only — [Pass SOC 2 as a seed-stage startup](https://guptadeepak.com/guides/soc-2-for-startups/)

### Inferences
- For a Canadian TMS/fleet challenger, the minimum enterprise-ready package is a SOC 2 Type II (Security plus Availability, with Confidentiality useful for shipper data), a public trust center (Vanta/Drata/SafeBase-style), and a roadmap to ISO 27001. ISO 27001 matters more for EU/global shippers and some Canadian enterprises. ISO 27701 is a privacy differentiator that maps well to Québec Law 25.
- TISAX is relevant only if selling to German automotive OEM supply chains. It is not a general freight requirement, and no freight vendor sources surfaced advertising it.
- Budget: roughly US$25k–50k all-in for year one, with 6–12 months elapsed. Starting the observation window early is the critical-path item.

### Gaps
- No primary Vanta or Drata price list was obtainable (vanta.com blocked; pricing is quote-based). Figures are from third-party and reseller sources.
- No 2024–2026 survey data quantifying what share of shipper RFPs mandate SOC 2 vs ISO 27001.
- Could not confirm project44's or Rose Rocket's current certification set; searches returned nothing direct.

---

## 2. SSO/SAML/SCIM, RBAC, audit logs, data retention (what enterprise RFPs ask)

### Takeaway
Enterprise fleet buyers expect SAML/OIDC SSO with an IdP (Okta, Entra), SCIM provisioning and deprovisioning (including role sync), granular role-based permissions, and exportable audit logs. Motive and Samsara both ship these. Data-retention controls are increasingly driven by privacy law (Law 25 destruction and anonymization, OPC guidance), not only by IT policy.

### Cited Findings
- Motive supports SSO via SAML and OIDC [OLDER, 2023] — [Motive security overview](https://gomotive.com/wp-content/uploads/2023/03/security_overview_guide.pdf)
- Motive Directory Sync supports any SCIM identity provider. It auto-adds and removes fleet users and drivers based on IdP assignment, and can sync roles (Fleet Admin, Fleet Manager). Setup requires contacting support — [Motive Help Center: Directory Sync](https://helpcenter.gomotive.com/hc/en-us/articles/24432875085213)
- Motive is listed in the Okta Integration Network — [Okta: Motive integration](https://www.okta.com/integrations/motive/)
- Motive markets to "Fortune 500 enterprises to small businesses," with nearly 100,000 customers — [Motive job posting](https://job-boards.greenhouse.io/gomotive/jobs/8096773002)
- The OPC says employees have access rights to monitoring data, so employers need an access-request process. This in turn requires vendors to support search and export of per-driver data — [OPC: Privacy in the Workplace](https://priv.gc.ca/en/privacy-topics/employers-and-employees/02_05_d_17/)
- TMS evaluation checklists ask whether core EDI and API capabilities are native rather than customer-funded projects (relevant to how RFPs are framed) — [Manifestly TMS evaluation checklist](https://app.manifest.ly/public/checklists/4db0066d9e2e0d066e7d3f7814ba1aba?modal=true)

### Inferences
- An enterprise RFP checklist should cover:
  - SAML 2.0/OIDC SSO, with SSO enforcement and an option to disable password login
  - SCIM 2.0 user and group provisioning, including driver deprovisioning on termination
  - Custom roles with field- and tag-level scoping (by terminal, region or customer)
  - Immutable audit logs (who viewed or exported location and video), exportable or streamed to a SIEM
  - Configurable retention per data type (GPS, video, HOS, documents), with deletion and anonymization
  - MFA for all users
  - IP allowlisting and API key scoping
- Gating SSO and SCIM behind a top tier (the "SSO tax") is common, but Canadian mid-market carriers may resist it. Offering SSO broadly could be a differentiator (inference, not sourced).

### Gaps
- Found no published enterprise freight RFP template that lists security questions verbatim. Buyers typically use SIG Lite, CAIQ or custom questionnaires, but this was not confirmed with a freight-specific source in this session.
- Samsara SSO and SCIM specifics were not retrieved (likely available, but unverified here).

---

## 3. Integration expectations: EDI, APIs, ERP and accounting, load boards, visibility networks

### Takeaway
EDI 204/990/214/210 (plus 997 acknowledgments) remain table stakes for carriers serving large shippers, because big retailers impose their own implementation guides. Real-time visibility via project44, FourKites or Descartes MacroPoint is effectively a prerequisite to tender for many shippers. A modern REST API with webhooks is increasingly expected alongside EDI. ERP integration and tender automation are described as table stakes in 2026.

### Cited Findings
- The core transportation EDI set is 204 (load tender), 990 (tender response), 214 (shipment status) and 210 (freight invoice), with 997 functional acknowledgment — [Tai Software: customer-facing EDI](https://learn.tai-software.com/knowledge/customer-facing-edi-support); [TrueCommerce: EDI for trucking](https://www.truecommerce.com/?p=56801)
- Some shippers track carriers' 990 response time as a performance metric — [TrueCommerce](https://www.truecommerce.com/?p=56801)
- Large shippers (Walmart, Amazon, Target, Home Depot) impose their own EDI implementation guides — [Xylity](https://xylitytech.com/?p=30345)
- An EDI 204 does not support tender updates or cancellations (an edge case to handle) — [Loadsmart developer docs](https://developer.loadsmart.com/docs/shipperguide/for-carriers/carrier-edis/)
- Buyers should confirm 204/210/214/990 are supported natively or via a mapping partner, plus REST API coverage for orders, status and rate confirmations — [Manifestly](https://app.manifest.ly/public/checklists/4db0066d9e2e0d066e7d3f7814ba1aba?modal=true)
- "Multimodal support, ERP integration, and tendering automation are table stakes in 2026" (vendor view) — [Shipwell blog, 2026](https://www.shipwell.com/blog/7-tms-capabilities-to-prioritize)
- Customized EDI integrations create onboarding bottlenecks for carriers — [Transport Topics](https://www.ttnews.com/articles/edi-custom-integration-issues)
- A project44 survey found 57.4% of shippers consider real-time visibility a prerequisite for a carrier to tender (vendor-commissioned) — [CCJ](https://www.ccjdigital.com/technology/article/15293150/realtime-visibility-key-to-reducing-supply-chain-volatility)
- "Many shippers and brokers require real-time visibility for every load they tender." Carriers satisfy project44 requirements by pushing TMS/ELD data to project44 — [TruckMaster: project44 integration](https://www.truckmaster.com/integrations/project44)
- Descartes MacroPoint, FourKites and project44 are the main shipper-side visibility platforms — [Descartes: MacroPoint vs FourKites](https://www.descartes.com/lp/macropoint-vs-fourkites)

### Inferences
- **Table stakes to sell to carriers serving enterprise shippers:**
  - EDI 204/990/214/210/997, ideally via a partner such as Orderful, SPS or TrueCommerce, so each trading-partner map is not a custom project
  - Native connectors to project44, FourKites, MacroPoint and Trucker Tools, so ELD/GPS pings flow automatically
  - Accounting sync with QuickBooks Online (dominant in SMB/mid carriers) and Sage
  - Load-board posting and search for DAT, Truckstop, and in Canada Loadlink and 123Loadboard
- **Mid/large differentiators:**
  - ERP connectors (NetSuite, Dynamics 365 BC/F&O, SAP, Oracle)
  - Public REST API plus webhooks, with documentation and sandbox
  - Developer portal
- Load-board and Canadian accounting (Sage, Xero) specifics were not separately verified in this session. The list above is market-knowledge inference.

### Gaps
- No source quantified the share of shippers mandating each visibility platform, or the required ping frequency (often 15 min) — unverified.
- Loadlink, 123Loadboard, DAT and Truckstop API availability and terms were not researched in this session.

---

## 4. Uptime/SLA norms, offline-capable driver apps, disaster recovery

### Takeaway
A contractual 99.9% monthly uptime with service credits is the TMS norm (Shipwell, Turvo, Logistaas). Marketing claims of "99.99%+" are common but not contractual. Ransomware outages at ORBCOMM (2023) and Radiant (2024) show why buyers ask about DR, offline/manual fallback and incident communication.

### Cited Findings
- Shipwell's SLA commits to monthly uptime above 99.9%, with service credits as added subscription days. Its marketing claims 99.9999% — [Shipwell SLA](https://shipwell.com/service-level-agreement)
- Turvo's SLA (effective Feb 2026) commits to 99.9% monthly uptime and publishes actuals of 99.99% (2022), 99.98% (2023) and 99.97% (2024) — [Turvo SLA](https://turvo.com/turvo-service-level-agreement/)
- Logistaas targets at least 99.9%, with credits of 5% of monthly fees below 99.9% and 10% below 99.5% — [Logistaas](https://logistaas.com/?p=46041)
- Linbis guarantees 99.9% (under about 45 min of downtime per month) — [Linbis status/SLA](https://www.linbis.com/?p=44578)
- Samsara says Canadian-hosted customers receive the same features and SLAs as US-hosted customers — [Samsara Canada data residency blog](https://www.samsara.com/ca/blog/canada-data-residency)
- ORBCOMM ransomware (Sept 6, 2023) took down FleetManager and Blue Tree ELDs. FMCSA allowed paper logs until Sept 29, 2023 [OLDER but a key precedent] — [FreightWaves](https://www.freightwaves.com/news/ransomware-attack-hits-orbcomms-bt-series-of-elds-paper-logs-are-back); [BleepingComputer](https://www.bleepingcomputer.com/news/security/orbcomm-ransomware-attack-causes-trucking-fleet-management-outage/?web_view=true)

### Inferences
- **RFP-ready baseline:**
  - Contractual 99.9% monthly uptime with a credit schedule
  - Public status page and historical uptime
  - Stated RPO/RTO (for example, RPO ≤1h and RTO ≤4h for core TMS; inference, not sourced)
  - Multi-AZ hosting, with backups in-region (Canada) for Canadian residency customers
  - Tested DR plan and annual pen test
- **Driver app:** offline capture of documents, PODs and status, with later sync, plus a documented ELD-malfunction fallback (paper logs per FMCSA and Canadian ELD rules). The ORBCOMM case shows buyers will ask "what happens when you're down."

### Gaps
- No source found specifying offline-mode expectations in shipper or carrier RFPs, or Samsara and Motive published SLA percentages.
- No Canadian ELD-specific malfunction rule was retrieved in this session.

---

## 5. Cyber and fraud threats in freight, 2024–2026, and the controls customers want

### Takeaway
Cargo crime has shifted from force to fraud. Incident counts are flat to falling, but losses are rising sharply: US losses were about $725M in 2025 (+60%), and Q3 2026 losses were $230M despite 33% fewer incidents, with fictitious pickups making up about 25% of incidents. Identity theft and double brokering are the dominant fraud types. Canada saw trailer thefts nearly double in 2025, concentrated in Ontario. Ransomware has hit carriers, 3PLs and freight software vendors. Buyers want carrier identity verification, MFA, account-takeover protections and audit trails.

### Cited Findings
**Cargo theft (US):**
- 2025: about $725M estimated losses (+60% vs 2024); average theft value $273,990 (+36%); 3,594 supply-chain crime incidents (flat vs 3,607); confirmed cargo thefts up 18% (2,243 to 2,646); CA, TX and IL account for 51.9% — [Verisk newsroom, released 2026-01-22](https://www.verisk.com/company/newsroom/cargo-theft-losses-surge-to-estimated-$725-million-in-2025-verisk-cargonet-analysis-reveals/); [CCJ](https://www.ccjdigital.com/regulations/article/15815405/cargo-theft-activity-flat-losses-surged-in-2025-cargonet)
- CargoNet warned that stricter enforcement could enlarge the pool of distressed carriers, creating opportunities for "fraudulent takeovers" — [CCJ](https://www.ccjdigital.com/regulations/article/15815405/cargo-theft-activity-flat-losses-surged-in-2025-cargonet)
- Q3 2026:
  - 547 incidents (−33% YoY); estimated losses $230.1M (+12% vs $205.1M)
  - Fictitious pickups: 138 incidents, about 25% of activity (up from 18%)
  - 19 thefts of $1M or more (vs 9); average theft value up 72% YTD
  - Another outlet reports +39% losses, so figures differ between outlets
  - Sources: [Verisk newsroom](https://www.verisk.com/company/newsroom/fewer-cargo-thefts-bigger-losses-average-theft-value-jumps-72-percent-year-to-date/); [CCJ](https://www.ccjdigital.com/regulations/article/16424466/cargo-theft-losses-climb-as-incidents-continue-to-decline); [FleetOwner](https://www.fleetowner.com/safety/news/55417063/cargo-theft-losses-rise-39-as-fictitious-pickups-remain-a-threat-to-trucking)
- CargoNet tracked $31.8M in Labor Day thefts as "criminals breach trusted freight accounts" (account takeover) — [FreightWaves](https://www.freightwaves.com/news/cargonet-tracks-31-8m-in-labor-day-thefts-as-criminals-breach-trusted-freight-accounts)

**Cargo theft (Canada, Équité Association):**
- About 970 trailer thefts nationally in 2025, up from about 570 in 2024. Cargo losses are likely underreported because cargo theft lacks its own police classification. Final 2025 figures were still being validated — [Trucknews](https://www.trucknews.com/security/canadas-trailer-theft-nearly-doubles-as-cargo-losses-go-underreported-in-2025/1003209612)
- About 1,601 thefts (tractors, trailers, cargo) in Ontario in 2025, vs about 240 in Alberta and 180 in Québec — [Trucknews](https://www.trucknews.com/security/canadas-trailer-theft-nearly-doubles-as-cargo-losses-go-underreported-in-2025/1003209612)
- Recovery rates fell from 13% to 9% (cargo) and from 64% to 44% (trailers), 2024 to 2025. This is a secondary blog; treat with caution — [GetTransport blog](https://blog.gettransport.com/news/trailer-theft-2025-statistics-recovery-rates/)
- Équité five-year study: over $531M in trucks, trailers and cargo stolen since 2019, with over $239M unrecovered [published 2024] — [Trucknews](https://www.trucknews.com/transportation/thieves-stole-cargo-equipment-worth-531-million-since-2019-in-canada/1003186599)
- The cargo-theft surge is tightening insurance underwriting standards for Canadian fleets — [Insurance Business Canada](https://www.insurancebusinessmag.com/ca/news/breaking-news/cargo-theft-surge-is-tightening-underwriting-standards-for-canadian-trucking-fleets-579644.aspx)

**Freight fraud and identity:**
- Highway Q1 2025 Freight Fraud Index: about 400,000 fraud attempts blocked. Identity theft, false pickups, sold carrier authorities and double brokering are rising, and identity theft is the leading tactic (vendor) — [AJOT](https://www.ajot.com/news/highway-releases-freight-fraud-index-revealing-400000-sophisticated-fraud-attempts-in-q1-2025)
- TIA "State of Fraud" (Apr 2025): unlawful brokering is the most common fraud type (34% of respondents), followed by identity theft (20%) — [TIA](https://member.tianet.org/TIAnetOrg/Member%20Resources/White-Papers/State-of-Fraud-in-the-Industry-April-2025.aspx)
- Truckstop tallied over US$455M in losses tied to theft, double brokering and impersonation in 2024 (vendor) — [Trucknews](https://www.trucknews.com/transportation/freight-fraud-losses-surpass-455m-in-2024)
- An owner-operator survey (Mar 2026) found 28% had experienced double brokering — [Overdrive](https://www.overdriveonline.com/business/article/15819815/majority-of-ownerops-victims-of-freight-fraud-broker-tricks-survey)

**Regulatory response (US):**
- FMCSA is rolling out the Motus registration system with identity verification (Login.gov and IDEMIA document verification) to fight identity theft and chameleon carriers. The initial release did not eliminate MC numbers, despite earlier reports that it would — [FMCSA registration](https://www.fmcsa.dot.gov/registration); [FreightWaves](https://www.freightwaves.com/?p=572785); [CCJ](https://www.ccjdigital.com/regulations/article/15666936/fmcsa-to-overhaul-registration-system-to-stamp-out-fraud)
- FMCSA created a Registration Fraud team — [Overdrive](https://www.overdriveonline.com/regulations/article/15684529/fmcsa-getting-close-to-cleanup-phase-for-registered-bad-actors)

**Ransomware and cyber incidents:**
- Radiant Logistics (3PL) filed an 8-K (Item 1.05) on Mar 20, 2024 for an incident detected about Mar 14, 2024. It isolated its Canadian operations, causing service delays for Canadian customers — [SEC 8-K](https://www.sec.gov/Archives/edgar/data/1171155/000095017024033954/rlgt-20240319.htm); [The Record](https://therecord.media/radiant-logistics-cyberattack-canada-operations)
- ORBCOMM ELD and fleet platform ransomware, Sept 2023 [OLDER] — [Transport Topics](https://ttnews.com/articles/orbcomm-ransomware-attack)
- Other carrier incidents (dates not verified in this session): Marten Transport, Estes Express, Central Freight Lines, and Forward Air (ransomware disclosed in an SEC filing; Forward Air's was in Dec 2020 [OLDER]) — [Transport Topics: trucking cybersecurity threats](https://ttnews.com/articles/trucking-cybersecurity-threats); [FreightWaves: Forward Air](https://www.freightwaves.com/news/forward-air-likely-hit-in-cyberattack-experts-say)
- CCJ's 2026 fleet cybersecurity guide covers current threats to trucks and freight — [CCJ](https://www.ccjdigital.com/technology/cybersecurity/article/15834860/fleet-cybersecurity-guide-2026-protect-your-trucks-and-freight)

### Inferences
- **Controls buyers will want in a TMS/fleet product:**
  1. Carrier identity verification and onboarding (integrations with Highway, Carrier Assure, RMIS/MyCarrierPackets, FMCSA and Motus, and for Canada, provincial CVOR/NSC lookups)
  2. Alerts on changes to carrier contact, email, phone or bank details, with dual approval for payment-detail changes
  3. Mandatory MFA and SSO to prevent account takeover of shipper and broker portals (the Labor Day "trusted accounts" breaches)
  4. Pickup verification (driver identity, geofence match of ELD/GPS to the assigned carrier, PIN or QR release codes)
  5. Load-level audit trails
  6. Anomaly detection on tracking (location mismatch vs assigned truck)
- **Canada angle:** the Ontario concentration of thefts and falling recovery rates make theft-prevention features (trailer GPS, geofence alerts, yard and drop-trailer monitoring) a strong Canadian sales message, especially as insurers tighten underwriting.

### Gaps
- Exact dates of Marten, Estes and Central Freight incidents were not verified in this session.
- No official Équité 2025 cargo-theft report (primary source) was found. Figures come from trade press.
- Highway Q4 2025 "direct theft ~half of stolen loads" claim appeared only in search summaries, not verified.

---

## 6. Canadian privacy: PIPEDA, Québec Law 25, Ontario electronic monitoring, driver cameras

### Takeaway
Selling into Canada means supporting customers' obligations on three fronts:
- **Québec Law 25** (phased in 2022–2024):
  - a PIA before any transfer of personal information outside Québec, including to other provinces and US clouds
  - PIAs for new technology projects
  - portability (since Sept 22, 2024)
  - penalties up to C$25M or 4% of turnover
- **Ontario's ESA electronic monitoring policy** (employers with 25 or more employees, since Oct 2022)
- **OPC/PIPEDA guidance** that monitoring be purpose-limited and least-intrusive. The OPC has criticized continuous driver-facing dash cams and audio.

### Cited Findings
**Québec Law 25:**
- Phased implementation in Sept 2022, Sept 2023 and Sept 2024. From Sept 22, 2023, PIAs are required for projects involving new information systems or technology, and for transfers outside Québec — [Syrenis](https://syrenis.com/resources/blog/quebecs-new-privacy-law-5-new-requirements-from-september-2023/); [Mondaq/Ankura](https://www.mondaq.com/unitedstates/privacy-protection/1386288/quebec-privacy-bill-64-law-25-requirements-in-quebecs-privacy-law-that-go-beyond-gdpr-and-ccpa)
- The transfer PIA must weigh sensitivity, purpose, safeguards (including contractual ones) and the destination's legal regime. A transfer may proceed only if information receives "adequate protection," and it requires a written agreement. Law 25 does not prohibit transfers — [Private AI](https://www.private-ai.com/ja/blog/law25-data-transfer); [Mitratech](https://mitratech.com/resource-hub/blog/quebec-law-25-and-third-party-risk-management/); [Google Cloud Law 25 page](https://cloud.google.com/security/compliance/quebeclaw25?hl=fr)
- Hosting in Ontario, or with a US cloud, counts as a transfer outside Québec — [Hilotech](https://hilotech.ca/en/wiki/law-25/cross-border-transfers)
- Organizations must inform individuals that their information may be communicated outside Québec — [Clym](https://www.clym.io/blog/quebec-law-25)
- The data portability right took effect Sept 22, 2024 — [DLA Piper, 2024-09-25](https://www.dlapiper.com/en-ar/insights/publications/2024/09/right-to-data-portability-in-quebec); [McCarthy Tétrault](https://www.mccarthy.ca/en/insights/blogs/techlex/quebecs-portability-regime)
- Penalties (sources differ on tiers): penal fines up to C$25M or 4% of worldwide turnover; CAI administrative monetary penalties up to C$10M or 2%. Osler notes CAI investigations were expected to conclude in 2025. No specific 2025 fines were found — [Osler](https://www.osler.com/en/insights/reports/no-signs-of-slow-down-in-privacy-law-reform/); [DataGrail](https://www.datagrail.io/glossary/quebec-bill-64/)

**Ontario electronic monitoring (Working for Workers Act, 2022, Bill 88):**
- Employers with 25 or more employees in Ontario on Jan 1 must have a written electronic monitoring policy covering whether, how and why they monitor. The count includes part-time staff and those on leave
- The first deadline was Oct 11, 2022, with copies to employees by Nov 10, 2022. In later years the policy is due by Mar 1
- Separate policies for different employee groups are allowed. The rule does not limit how employers use monitoring data
- Sources: [Blakes](https://www.blakes.com/insights/bulletins/2022/ontario-employee-electronic-monitoring-policy); [Osler](https://www.osler.com/en/resources/regulations/2022/ontario-s-electronic-monitoring-policy-requirements-now-in-effect); [Law Times](https://lawtimesnews.com/practice-areas/labour-and-employment/ontario-releases-new-guidance-on-electronic-monitoring-of-employees/369091) [2022, still in force; no 2024–26 changes found]

**OPC / PIPEDA (federally regulated employers, including interprovincial trucking):**
- OPC "Privacy in the Workplace" (updated May 2023 [OLDER but current guidance]): monitoring must be for specific, targeted and appropriate purposes, using the least-intrusive means. Employees must be told the purpose, extent and consequences of monitoring. Employees have access rights to monitoring data. A PIA is recommended — [OPC](https://priv.gc.ca/en/privacy-topics/employers-and-employees/02_05_d_17/); [BLG](https://www.blg.com/en/insights/2023/06/new-opc-guidance-privacy-in-the-workplace); [McMillan](https://mcmillan.ca/insights/publications/opc-takes-firm-stance-on-privacy-in-the-workplace-takeaways-for-employers/)
- Consent cannot cure unreasonable collection. "Accept the job, accept surveillance" is not meaningful consent — [BLG](https://www.blg.com/en/insights/2023/06/new-opc-guidance-privacy-in-the-workplace)
- The OPC found continuous dash-cam recording of drivers, including off-duty time, compromised privacy. In 2022 findings, dash cams with audio were assessed on reasonableness, and the employer stopped audio recording. The OPC accepts dash cams and telematics for legitimate safety and asset-protection purposes — [MLT Aikins](https://www.mltaikins.com/insights/thinking-of-surveilling-your-employees-here-are-some-tips/); [Dentons Data](https://www.dentonsdata.com/?p=4826); [Ogletree](https://ogletree.com/insights-resources/blog-posts/telematics-and-in-cab-video-surveillance-trends-and-tips-for-employers/)

### Inferences
- **Product features that help Canadian customers comply:**
  - Configurable driver-facing camera modes (event-triggered only, no continuous recording, audio off by default, privacy mode when off-duty)
  - Retention limits
  - Driver-level access and export, to fulfil access requests and Law 25 portability
  - An editable electronic-monitoring policy template (Ontario)
  - A PIA/TIA support pack (data map, subprocessors, hosting locations, safeguards)
  - French-language UI and documents for Québec (Charter of the French Language, Bill 96; not researched here)
- Québec customers will ask where data is hosted, including backups and support access. Even Ontario hosting triggers a Law 25 transfer assessment, but Canadian hosting makes the assessment straightforward.

### Gaps
- Bill C-27/CPPA (federal PIPEDA replacement) died on the order paper in Jan 2025. Any successor bill in 2025–26 was not researched here.
- Québec's specific rules on biometric data (relevant to driver-facing AI cameras with face recognition, which require CAI declaration under the IT Framework Act) were not verified in this session.
- No CAI 2025–26 enforcement decisions were found.

---

## 7. Data residency expectations in Canada

### Takeaway
Canadian hosting has become a competitive feature in fleet telematics. Samsara launched Canadian data residency on AWS Canada on Jan 26, 2026, at parity with US features and SLAs. Buyers should verify that backups, support access and subprocessors also stay in Canada.

### Cited Findings
- Samsara's Canadian data centre (AWS Canada) went live Jan 26, 2026. Residency is immediately available for new Canadian customers, existing customers stay on their current systems, and features and SLAs match US hosting — [Samsara blog](https://www.samsara.com/ca/blog/canada-data-residency); [BusinessWire, 2026-02-03](https://www.businesswire.com/news/home/20260203584292/en/Samsara-Deepens-Investment-in-Canada-With-Local-Data-Residency-Domestic-Fulfillment-and-Continued-Market-Growth)
- Storing data in a Canadian region does not stop data flows abroad during processing or support. Residency claims should cover backups, support and subprocessors — [Lorikeet guide](https://www.lorikeetcx.ai/articles/ai-support-canadian-data-residency-guide)
- Data residency (where data is stored) is distinct from data sovereignty (whose laws apply; for example, the US CLOUD Act reaches US-owned providers) — [Pax8](https://www.pax8.com/blog/data-residency-vs-data-sovereignty-in-canada/)
- Canadian residency is commonly a hard requirement in public-sector and healthcare procurement — [StackHarbor](https://stackharbor.com/en/blog/canadian-data-residency-public-sector-healthcare-procurement/)

### Inferences
- For a Canadian-built TMS (for example, a Rose Rocket-type competitor), "Canadian-owned, Canadian-hosted (ca-central-1/Montréal plus Calgary), Canadian support" is a credible wedge against US incumbents. Samsara's 2026 move shows incumbents now see it as worth matching.
- Most private-sector carriers are not legally required to host in Canada. Residency is a buyer preference and procurement checkbox (public sector, Crown corporations, Québec risk-averse buyers), not a general PIPEDA mandate. PIPEDA allows cross-border transfers with notice and comparable protection (general knowledge; the OPC transfer guidance was not fetched in this session).

### Gaps
- Could not confirm whether Motive, Trimble, Descartes, Rose Rocket or project44 offer Canadian hosting; searches returned nothing direct.
- No survey data on what share of Canadian carriers or shippers require in-country hosting.

---

## Consolidated enterprise-buyer checklist (synthesized from the above; each line traces to sections 1–7)

| Area | Table stakes (mid-market) | Enterprise / differentiator |
|---|---|---|
| Certifications | SOC 2 Type II (Security plus Availability), trust center, annual pen test | ISO 27001 (+27701 privacy), SOC 1 if handling invoicing and payments |
| Identity | MFA enforced, RBAC | SAML/OIDC SSO, SCIM provisioning with role sync, SSO enforcement |
| Audit/retention | Activity audit log | Immutable exportable or SIEM-streamed logs, per-data-type retention and deletion |
| Integrations | EDI 204/990/214/210/997; QuickBooks/Sage; DAT/Truckstop/Loadlink/123LB; project44/FourKites/MacroPoint/Trucker Tools | Public REST API plus webhooks and sandbox; NetSuite/Dynamics/SAP/Oracle connectors |
| Reliability | 99.9% contractual monthly uptime with credits; status page | Published historical uptime, stated RPO/RTO, offline driver app, incident-comms SLA |
| Fraud controls | Carrier vetting integration, contact and bank-change alerts | Pickup verification (geofence plus PIN), tracking-anomaly detection, dual approval on payments |
| Canada privacy | Ontario monitoring-policy template, configurable camera and audio, driver data access/export | Canadian hosting incl. backups, Law 25 PIA/transfer pack, French UI, portability export |
