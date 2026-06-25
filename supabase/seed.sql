-- Czech revision rules — derived from the legal research.
-- Owner-occupied family home: only the chimney is genuinely legally mandatory.
insert into revision_rules (country,property_type,usage_context,system_type,interval_months,interval_note,wording_type,legal_basis,message) values
-- CHIMNEY — mandatory for owner-occupied (vyhl. 34/2016 Sb.)
('CZ','house','owner_occupied','chimney',12,'Pevná paliva: čištění 3×/rok + kontrola 1×/rok; kapalná: čištění 2×/rok; plynná: 1×/rok','legal_required','Vyhláška č. 34/2016 Sb. (zák. 320/2015 Sb.)','Kontrola spalinové cesty — zákonná povinnost. Sankce až 50 000 Kč (FO).'),
('CZ','apartment','owner_occupied','chimney',12,'Dle paliva připojeného spotřebiče','legal_required','Vyhláška č. 34/2016 Sb.','Kontrola spalinové cesty — zákonná povinnost.'),
-- GAS — NOT mandatory for owners living in RD/byt (§19 NV 191/2022), recommended for insurance
('CZ','house','owner_occupied','gas',36,'Pro vlastníky RD/bytů není zákonná povinnost; doporučeno kvůli bezpečnosti a pojišťovně','insurance_recommended','§19 NV 191/2022 Sb. — vlastníci RD/bytů vyňati','Revize plynu — není ze zákona povinná pro váš dům, ale pojišťovny ji běžně vyžadují.'),
('CZ','house','rental','gas',36,'Kontrola 1×/rok, provozní revize 1×/3 roky','legal_required','NV 191/2022 Sb. (zák. 250/2021 Sb.)','U pronájmu se stává povinnou — provozní revize plynu.'),
('CZ','house','svj','gas',36,'Kontrola 1×/rok, provozní revize 1×/3 roky','legal_required','NV 191/2022 Sb.','U SVJ/bytového domu povinná provozní revize plynu.'),
-- ELECTRICAL — not mandated for owner-occupied; insurance-driven; mandatory for rental/business
('CZ','house','owner_occupied','electrical',60,'Pro vlastní bydlení zákon nepředepisuje; obvyklý interval dle ČSN 33 1500','insurance_recommended','NV 190/2022 Sb. / ČSN 33 1500','Revize elektroinstalace — doporučeno, často podmínka pojistného plnění.'),
('CZ','house','rental','electrical',60,'Dle ČSN 33 1500 / charakteru prostředí','legal_required','NV 190/2022 Sb. (zák. 250/2021 Sb.)','U pronájmu povinná pravidelná revize elektroinstalace.'),
('CZ','house','business','electrical',36,'Kratší interval dle prostředí','legal_required','NV 190/2022 Sb.','U podnikání povinná pravidelná revize elektroinstalace.'),
-- LIGHTNING PROTECTION (LPS)
('CZ','house','owner_occupied','lps',48,'Dle třídy LPS (ČSN EN 62305)','recommended','ČSN EN 62305','Revize hromosvodu — doporučeno dle třídy ochrany.');
