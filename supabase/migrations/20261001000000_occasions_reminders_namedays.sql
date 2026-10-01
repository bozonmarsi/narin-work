-- Occasions: skutečné připomínky e-mailem, jmeniny a narozeniny u lidí.
--
-- Do teď stránka /members/occasions slibovala "5 dní předem vám dáme vědět",
-- ale nic takového neexistovalo: žádná funkce, cron ani šablona e-mailu.
-- Tahle migrace to doplňuje:
--   * cz_namedays (+ cz_name_aliases) — oficiální český kalendář jmen
--     (zdroj: npm namedays-cs, MIT; "Hromnice" vyřazeny, Petr = 29. 6.),
--     z něj se lidem v adresáři automaticky dopočítají jmeniny;
--   * recipients.birthday_* a nameday_* — narozeniny (rok nepovinný)
--     a jmeniny jako vlastnost člověka;
--   * occasion_settings — kolik dní předem, zda posílat, a "balíčky" svátků:
--       - obvyklé (pack_basic, výchozí ZAP): Valentýn 14. 2., MDŽ 8. 3.,
--         Den matek podle kalendáře SNS (poslední neděle v listopadu),
--         Vánoce 24. 12. a pravoslavné Vánoce 7. 1.;
--       - české (pack_cz, výchozí VYP): Den matek CZ (2. neděle v květnu),
--         Den učitelů, Den otců;
--       - jmeniny (namedays, výchozí VYP) — jen kdo si je zapne;
--   * occasion_upcoming() — jediný zdroj "co se kdy slaví" pro web i cron;
--   * send_occasion_reminders() — každé ráno pošle přes notify_brevo
--     souhrnný e-mail 3 dny předem (nastavitelné) a den předem jednu
--     "poslední šanci", jen pokud klient mezitím nic neobjednal. Když už má
--     na ten den objednávku, nepíšeme vůbec. Obecné svátky z balíčku dostávají
--     jen klienti, kteří Occasions používají (mají uložené lidi/data/nastavení).
--   * květinový concierge: u člověka rozpočet, co mu posílat (kytice, dort,
--     jahody, plyšák) a "autopilot" — když klient do dne před svátkem nic
--     nevybere, dostanou manažeři v Telegramu úkol připravit dárek sami
--     (platba z depozitu klienta před doručením).
-- Bezpečné spustit opakovaně.

-- ---------- kalendář jmen ----------
CREATE TABLE IF NOT EXISTS cz_namedays (
  month smallint NOT NULL,
  day smallint NOT NULL,
  name text NOT NULL,
  PRIMARY KEY (name, month, day)
);

CREATE OR REPLACE FUNCTION cz_name_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT translate(lower(btrim(coalesce(p, ''))), 'áäčďéěëíňóöřšťúůüýž', 'aacdeeeinoorstuuuyz')
$$;

INSERT INTO cz_namedays (month, day, name) VALUES
(1,2,'Karina'),
(1,3,'Radmila'),
(1,3,'Radomil'),
(1,4,'Diana'),
(1,5,'Dalimil'),
(1,6,'Kašpar'),
(1,6,'Melichar'),
(1,6,'Baltazar'),
(1,7,'Vilma'),
(1,8,'Čestmír'),
(1,9,'Vladan'),
(1,9,'Valtr'),
(1,10,'Břetislav'),
(1,11,'Bohdana'),
(1,12,'Pravoslav'),
(1,13,'Edita'),
(1,14,'Radovan'),
(1,15,'Alice'),
(1,16,'Ctirad'),
(1,17,'Drahoslav'),
(1,18,'Vladislav'),
(1,18,'Vladislava'),
(1,19,'Doubravka'),
(1,20,'Ilona'),
(1,20,'Sebastián'),
(1,21,'Běla'),
(1,22,'Slavomír'),
(1,22,'Slavomíra'),
(1,23,'Zdeněk'),
(1,24,'Milena'),
(1,25,'Miloš'),
(1,26,'Zora'),
(1,27,'Ingrid'),
(1,28,'Otýlie'),
(1,29,'Zdislava'),
(1,30,'Robin'),
(1,30,'Erna'),
(1,31,'Marika'),
(1,31,'Spytihněv'),
(2,1,'Hynek'),
(2,2,'Nela'),
(2,3,'Blažej'),
(2,4,'Jarmila'),
(2,5,'Dobromila'),
(2,6,'Vanda'),
(2,7,'Veronika'),
(2,8,'Milada'),
(2,9,'Apolena'),
(2,10,'Mojmír'),
(2,11,'Božena'),
(2,12,'Slavěna'),
(2,12,'Slávka'),
(2,13,'Věnceslav'),
(2,13,'Věnceslava'),
(2,14,'Valentýn'),
(2,14,'Valentýna'),
(2,15,'Jiřina'),
(2,16,'Ljuba'),
(2,17,'Miloslava'),
(2,18,'Gizela'),
(2,19,'Patrik'),
(2,20,'Oldřich'),
(2,21,'Lenka'),
(2,21,'Eleonora'),
(2,23,'Svatopluk'),
(2,24,'Matěj'),
(2,24,'Matyáš'),
(2,25,'Liliana'),
(2,26,'Dorota'),
(2,27,'Alexandr'),
(2,28,'Lumír'),
(2,29,'Horymír'),
(3,1,'Bedřich'),
(3,1,'Bedřiška'),
(3,2,'Anežka'),
(3,3,'Kamil'),
(3,3,'Kunhuta'),
(3,4,'Stela'),
(3,5,'Kazimír'),
(3,6,'Miroslav'),
(3,7,'Tomáš'),
(3,8,'Gabriela'),
(3,8,'Zoltán'),
(3,9,'Františka'),
(3,10,'Viktorie'),
(3,11,'Anděla'),
(3,12,'Řehoř'),
(3,13,'Růžena'),
(3,14,'Rút'),
(3,14,'Matylda'),
(3,15,'Ida'),
(3,16,'Elena'),
(3,16,'Herbert'),
(3,17,'Vlastimil'),
(3,17,'Vlastimila'),
(3,18,'Eduard'),
(3,19,'Josef'),
(3,19,'Josefa'),
(3,20,'Světlana'),
(3,21,'Radek'),
(3,22,'Leona'),
(3,22,'Leontina'),
(3,22,'Lea'),
(3,23,'Ivona'),
(3,24,'Gabriel'),
(3,25,'Marián'),
(3,26,'Emanuel'),
(3,27,'Dita'),
(3,28,'Soňa'),
(3,29,'Taťána'),
(3,30,'Arnošt'),
(3,30,'Ernest'),
(3,31,'Kvido'),
(4,1,'Hugo'),
(4,2,'Erika'),
(4,3,'Richard'),
(4,4,'Ivana'),
(4,5,'Miroslava'),
(4,5,'Mirka'),
(4,6,'Vendula'),
(4,6,'Venuše'),
(4,7,'Heřman'),
(4,7,'Hermína'),
(4,8,'Ema'),
(4,9,'Dušan'),
(4,10,'Darja'),
(4,11,'Izabela'),
(4,12,'Julius'),
(4,13,'Aleš'),
(4,14,'Vincenc'),
(4,15,'Anastázie'),
(4,16,'Irena'),
(4,16,'Bernadeta'),
(4,17,'Rudolf'),
(4,18,'Valérie'),
(4,19,'Rostislav'),
(4,20,'Marcela'),
(4,21,'Alexandra'),
(4,22,'Evženie'),
(4,23,'Vojtěch'),
(4,24,'Jiří'),
(4,25,'Marek'),
(4,26,'Oto'),
(4,27,'Jaroslav'),
(4,28,'Vlastislav'),
(4,29,'Robert'),
(4,30,'Blahoslav'),
(5,2,'Zikmund'),
(5,3,'Alexej'),
(5,3,'Alex'),
(5,4,'Květoslav'),
(5,5,'Klaudie'),
(5,6,'Radoslav'),
(5,7,'Stanislav'),
(5,9,'Ctibor'),
(5,10,'Blažena'),
(5,11,'Svatava'),
(5,12,'Pankrác'),
(5,13,'Servác'),
(5,14,'Bonifác'),
(5,15,'Žofie'),
(5,15,'Sofie'),
(5,16,'Přemysl'),
(5,17,'Aneta'),
(5,18,'Nataša'),
(5,19,'Ivo'),
(5,20,'Zbyšek'),
(5,21,'Monika'),
(5,22,'Emil'),
(5,23,'Vladimír'),
(5,23,'Vladimíra'),
(5,24,'Jana'),
(5,24,'Vanesa'),
(5,25,'Viola'),
(5,26,'Filip'),
(5,27,'Valdemar'),
(5,28,'Vilém'),
(5,29,'Maxmilián'),
(5,29,'Maxim'),
(5,30,'Ferdinand'),
(5,31,'Kamila'),
(6,1,'Laura'),
(6,2,'Jarmil'),
(6,3,'Tamara'),
(6,3,'Kevin'),
(6,4,'Dalibor'),
(6,5,'Dobroslav'),
(6,5,'Dobroslava'),
(6,6,'Norbert'),
(6,7,'Iveta'),
(6,7,'Slavoj'),
(6,8,'Medard'),
(6,9,'Stanislava'),
(6,10,'Gita'),
(6,10,'Margita'),
(6,11,'Bruno'),
(6,12,'Antonie'),
(6,13,'Antonín'),
(6,14,'Roland'),
(6,14,'Herta'),
(6,15,'Vít'),
(6,16,'Zbyněk'),
(6,17,'Adolf'),
(6,18,'Milan'),
(6,18,'Milana'),
(6,19,'Leoš'),
(6,19,'Leo'),
(6,20,'Květa'),
(6,20,'Květuše'),
(6,21,'Alois'),
(6,21,'Aloisie'),
(6,22,'Pavla'),
(6,23,'Zdeňka'),
(6,24,'Jan'),
(6,25,'Ivan'),
(6,26,'Adriana'),
(6,26,'Adrian'),
(6,27,'Ladislav'),
(6,27,'Ladislava'),
(6,28,'Lubomír'),
(6,29,'Petr'),
(6,29,'Pavel'),
(6,30,'Šárka'),
(7,1,'Jaroslava'),
(7,2,'Patricie'),
(7,3,'Radomír'),
(7,3,'Radomíra'),
(7,4,'Prokop'),
(7,5,'Cyril'),
(7,5,'Metoděj'),
(7,7,'Bohuslava'),
(7,8,'Nora'),
(7,9,'Drahoslava'),
(7,9,'Drahuše'),
(7,10,'Libuše'),
(7,10,'Amálie'),
(7,11,'Olga'),
(7,11,'Helga'),
(7,12,'Bořek'),
(7,13,'Markéta'),
(7,14,'Karolína'),
(7,15,'Jindřich'),
(7,16,'Luboš'),
(7,17,'Martina'),
(7,18,'Drahomíra'),
(7,18,'Drahomír'),
(7,19,'Čeněk'),
(7,20,'Ilja'),
(7,21,'Vítězslav'),
(7,21,'Vítězslava'),
(7,22,'Magdaléna'),
(7,22,'Magda'),
(7,23,'Libor'),
(7,24,'Kristýna'),
(7,25,'Jakub'),
(7,26,'Anna'),
(7,26,'Anita'),
(7,27,'Věroslav'),
(7,28,'Viktor'),
(7,28,'Alina'),
(7,29,'Marta'),
(7,30,'Bořivoj'),
(7,31,'Ignác'),
(8,1,'Oskar'),
(8,2,'Gustav'),
(8,3,'Miluše'),
(8,4,'Dominik'),
(8,4,'Dominika'),
(8,5,'Kristián'),
(8,6,'Oldřiška'),
(8,7,'Lada'),
(8,8,'Soběslav'),
(8,9,'Roman'),
(8,10,'Vavřinec'),
(8,11,'Zuzana'),
(8,12,'Klára'),
(8,13,'Alena'),
(8,14,'Alan'),
(8,15,'Hana'),
(8,16,'Jáchym'),
(8,17,'Petra'),
(8,18,'Helena'),
(8,18,'Jelena'),
(8,19,'Ludvík'),
(8,20,'Bernard'),
(8,21,'Johana'),
(8,22,'Bohuslav'),
(8,23,'Sandra'),
(8,24,'Bartoloměj'),
(8,25,'Radim'),
(8,26,'Luděk'),
(8,27,'Otakar'),
(8,28,'Augustýn'),
(8,29,'Evelína'),
(8,30,'Vladěna'),
(8,31,'Pavlína'),
(9,1,'Linda'),
(9,1,'Samuel'),
(9,2,'Adéla'),
(9,3,'Bronislav'),
(9,3,'Bronislava'),
(9,4,'Jindřiška'),
(9,4,'Rozálie'),
(9,5,'Boris'),
(9,6,'Boleslav'),
(9,7,'Regína'),
(9,8,'Mariana'),
(9,9,'Daniela'),
(9,10,'Irma'),
(9,11,'Denisa'),
(9,11,'Denis'),
(9,12,'Marie'),
(9,13,'Lubor'),
(9,14,'Radka'),
(9,15,'Jolana'),
(9,16,'Ludmila'),
(9,16,'Lidmila'),
(9,17,'Naděžda'),
(9,17,'Naďa'),
(9,18,'Kryštof'),
(9,19,'Zita'),
(9,20,'Oleg'),
(9,21,'Matouš'),
(9,22,'Darina'),
(9,23,'Berta'),
(9,24,'Jaromír'),
(9,24,'Jaromíra'),
(9,25,'Zlata'),
(9,25,'Zlatuše'),
(9,26,'Andrea'),
(9,27,'Jonáš'),
(9,28,'Václav'),
(9,28,'Václava'),
(9,29,'Michal'),
(9,29,'Michael'),
(9,30,'Jeroným'),
(9,30,'Ráchel'),
(10,1,'Igor'),
(10,2,'Olívie'),
(10,2,'Oliver'),
(10,3,'Bohumil'),
(10,4,'František'),
(10,5,'Eliška'),
(10,6,'Hanuš'),
(10,7,'Justýna'),
(10,8,'Věra'),
(10,9,'Štefan'),
(10,9,'Sára'),
(10,10,'Marina'),
(10,11,'Andrej'),
(10,12,'Marcel'),
(10,13,'Renáta'),
(10,14,'Agáta'),
(10,15,'Tereza'),
(10,15,'Terezie'),
(10,16,'Havel'),
(10,16,'Galina'),
(10,17,'Hedvika'),
(10,18,'Lukáš'),
(10,19,'Michaela'),
(10,19,'Michala'),
(10,20,'Vendelín'),
(10,21,'Brigita'),
(10,22,'Sabina'),
(10,23,'Teodor'),
(10,24,'Nina'),
(10,25,'Beáta'),
(10,26,'Erik'),
(10,27,'Šarlota'),
(10,27,'Zoe'),
(10,28,'Jidáš'),
(10,28,'Alfréd'),
(10,29,'Silvie'),
(10,29,'Sylva'),
(10,30,'Tadeáš'),
(10,31,'Štěpánka'),
(11,1,'Felix'),
(11,2,'Tobiáš'),
(11,3,'Hubert'),
(11,4,'Karel'),
(11,4,'Karla'),
(11,5,'Miriam'),
(11,6,'Liběna'),
(11,6,'Leonard'),
(11,7,'Saskie'),
(11,8,'Bohumír'),
(11,8,'Bohumíra'),
(11,9,'Bohdan'),
(11,10,'Evžen'),
(11,11,'Martin'),
(11,12,'Benedikt'),
(11,13,'Tibor'),
(11,14,'Sáva'),
(11,15,'Leopold'),
(11,16,'Otmar'),
(11,17,'Mahulena'),
(11,17,'Gertruda'),
(11,18,'Romana'),
(11,19,'Alžběta'),
(11,20,'Nikola'),
(11,21,'Albert'),
(11,22,'Cecílie'),
(11,23,'Klement'),
(11,24,'Emílie'),
(11,25,'Kateřina'),
(11,26,'Artur'),
(11,27,'Xenie'),
(11,28,'René'),
(11,29,'Zina'),
(11,30,'Ondřej'),
(12,1,'Iva'),
(12,2,'Blanka'),
(12,3,'Svatoslav'),
(12,4,'Barbora'),
(12,5,'Jitka'),
(12,6,'Mikuláš'),
(12,7,'Ambrož'),
(12,7,'Benjamín'),
(12,8,'Květoslava'),
(12,9,'Vratislav'),
(12,10,'Julie'),
(12,11,'Dana'),
(12,11,'Danuše'),
(12,12,'Simona'),
(12,13,'Lucie'),
(12,14,'Lýdie'),
(12,15,'Radana'),
(12,15,'Radan'),
(12,16,'Albína'),
(12,17,'Daniel'),
(12,18,'Miloslav'),
(12,19,'Ester'),
(12,20,'Dagmar'),
(12,21,'Natálie'),
(12,22,'Šimon'),
(12,23,'Vlasta'),
(12,24,'Adam'),
(12,24,'Eva'),
(12,26,'Štěpán'),
(12,27,'Žaneta'),
(12,28,'Bohumila'),
(12,29,'Judita'),
(12,30,'David'),
(12,31,'Silvestr')
ON CONFLICT DO NOTHING;

-- Domácké tvary, které jednoznačně patří k jednomu jménu (Míša, Péťa apod. ne).
CREATE TABLE IF NOT EXISTS cz_name_aliases (
  alias_key text PRIMARY KEY,
  name text NOT NULL
);
INSERT INTO cz_name_aliases (alias_key, name) VALUES
('honza','Jan'),('jenda','Jan'),('pepa','Josef'),('pepik','Josef'),('kuba','Jakub'),('jirka','Jiří'),
('tonda','Antonín'),('franta','František'),('vasek','Václav'),('venca','Václav'),('mirek','Miroslav'),
('standa','Stanislav'),('ondra','Ondřej'),('vlada','Vladimír'),('bohous','Bohumil'),('svata','Svatopluk'),
('verca','Veronika'),('verunka','Veronika'),('katka','Kateřina'),('kata','Kateřina'),('lucka','Lucie'),
('bara','Barbora'),('barca','Barbora'),('terka','Tereza'),('terezka','Tereza'),('zuzka','Zuzana'),
('janicka','Jana'),('anicka','Anna'),('andulka','Anna'),('maruska','Marie'),('majda','Magdalena'),
('hanka','Hana'),('hanicka','Hana'),('evicka','Eva'),('klarka','Klára'),('kristynka','Kristýna'),
('martinka','Martina'),('lenicka','Lenka'),('dasa','Dagmar'),('danca','Daniela'),('ilonka','Ilona'),
('simca','Simona'),('pavlinka','Pavlína'),('alenka','Alena'),('jituska','Jitka'),('irenka','Irena'),
('vlasta','Vlastimila'),('olinka','Olga'),('dominika','Dominika'),('natalka','Natálie')
ON CONFLICT (alias_key) DO NOTHING;

ALTER TABLE cz_namedays ENABLE ROW LEVEL SECURITY;
ALTER TABLE cz_name_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "public_read_cz_namedays" ON cz_namedays;
CREATE POLICY "public_read_cz_namedays" ON cz_namedays FOR SELECT USING (true);
DROP POLICY IF EXISTS "public_read_cz_name_aliases" ON cz_name_aliases;
CREATE POLICY "public_read_cz_name_aliases" ON cz_name_aliases FOR SELECT USING (true);

-- Jmeniny podle jména: projde slova ("Máma Jana", "Jana Nováková", "Honza")
-- a vrátí první, které je v kalendáři (přímo nebo přes domácký tvar).
CREATE OR REPLACE FUNCTION cz_nameday_for(p_name text)
RETURNS TABLE(month smallint, day smallint, name text)
LANGUAGE sql STABLE AS $$
  WITH words AS (
    SELECT w, ord FROM regexp_split_to_table(coalesce(p_name, ''), '[^[:alpha:]]+') WITH ORDINALITY AS t(w, ord)
    WHERE w <> ''
  )
  SELECT n.month, n.day, n.name
  FROM words
  LEFT JOIN cz_name_aliases a ON a.alias_key = cz_name_key(words.w)
  JOIN cz_namedays n ON cz_name_key(n.name) = cz_name_key(coalesce(a.name, words.w))
  ORDER BY words.ord, n.month, n.day
  LIMIT 1
$$;

-- ---------- lidé: narozeniny a jmeniny ----------
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS birthday_day smallint CHECK (birthday_day BETWEEN 1 AND 31);
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS birthday_month smallint CHECK (birthday_month BETWEEN 1 AND 12);
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS birthday_year smallint CHECK (birthday_year BETWEEN 1900 AND 2100);
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS nameday_day smallint CHECK (nameday_day BETWEEN 1 AND 31);
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS nameday_month smallint CHECK (nameday_month BETWEEN 1 AND 12);
-- concierge
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS budget int CHECK (budget BETWEEN 0 AND 100000);
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS gift_prefs text[] NOT NULL DEFAULT '{}';
ALTER TABLE recipients ADD COLUMN IF NOT EXISTS autopilot boolean NOT NULL DEFAULT false;

-- Už uložení lidé: jen dopočítat datum jmenin. Zobrazují se a připomínají
-- jen klientům, kteří si jmeniny sami zapnou (occasion_settings.namedays).
UPDATE recipients r SET nameday_month = n.month, nameday_day = n.day
FROM (
  SELECT r2.id, nd.month, nd.day
  FROM recipients r2 CROSS JOIN LATERAL cz_nameday_for(r2.name) nd
  WHERE r2.nameday_month IS NULL
) n
WHERE n.id = r.id;

-- ---------- nastavení připomínek ----------
CREATE TABLE IF NOT EXISTS occasion_settings (
  email text PRIMARY KEY,               -- vždy lower()
  lead_days smallint NOT NULL DEFAULT 3 CHECK (lead_days BETWEEN 1 AND 30),
  email_enabled boolean NOT NULL DEFAULT true,
  pack_basic boolean NOT NULL DEFAULT true,
  pack_cz boolean NOT NULL DEFAULT false,
  namedays boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE occasion_settings ADD COLUMN IF NOT EXISTS pack_basic boolean NOT NULL DEFAULT true;
ALTER TABLE occasion_settings ADD COLUMN IF NOT EXISTS pack_cz boolean NOT NULL DEFAULT false;
ALTER TABLE occasion_settings ADD COLUMN IF NOT EXISTS namedays boolean NOT NULL DEFAULT false;
ALTER TABLE occasion_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "manager_all_occasion_settings" ON occasion_settings;
CREATE POLICY "manager_all_occasion_settings" ON occasion_settings FOR ALL USING (is_manager());

CREATE TABLE IF NOT EXISTS occasion_reminder_log (
  email text NOT NULL,
  occasion_key text NOT NULL,
  occasion_date date NOT NULL,
  kind text NOT NULL,                   -- 'first' | 'last_call'
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (email, occasion_key, occasion_date, kind)
);
ALTER TABLE occasion_reminder_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "manager_all_occasion_reminder_log" ON occasion_reminder_log;
CREATE POLICY "manager_all_occasion_reminder_log" ON occasion_reminder_log FOR ALL USING (is_manager());

-- ---------- výpočet termínů ----------
CREATE OR REPLACE FUNCTION occ_prague_today()
RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Europe/Prague')::date $$;

-- Den v měsíci, oříznutý na poslední den (29. 2. v nepřestupném roce = 28. 2., 31. → 30.)
CREATE OR REPLACE FUNCTION occ_make_date(y int, m int, d int)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT make_date(y, m, least(d, extract(day FROM (make_date(y, m, 1) + interval '1 month - 1 day'))::int))
$$;

CREATE OR REPLACE FUNCTION occ_next_annual(m int, d int, p_from date)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN occ_make_date(extract(year FROM p_from)::int, m, d) >= p_from
              THEN occ_make_date(extract(year FROM p_from)::int, m, d)
              ELSE occ_make_date(extract(year FROM p_from)::int + 1, m, d) END
$$;

-- n-tá neděle v měsíci (Den matek = 2. neděle v květnu, Den otců = 3. neděle v červnu)
CREATE OR REPLACE FUNCTION occ_nth_sunday(y int, m int, n int)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT make_date(y, m, 1) + ((7 - extract(dow FROM make_date(y, m, 1))::int) % 7) + (n - 1) * 7
$$;

CREATE OR REPLACE FUNCTION occ_next_nth_sunday(m int, n int, p_from date)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN occ_nth_sunday(extract(year FROM p_from)::int, m, n) >= p_from
              THEN occ_nth_sunday(extract(year FROM p_from)::int, m, n)
              ELSE occ_nth_sunday(extract(year FROM p_from)::int + 1, m, n) END
$$;

-- poslední neděle v měsíci (Den matek podle kalendáře SNS = poslední neděle v listopadu)
CREATE OR REPLACE FUNCTION occ_last_sunday(y int, m int)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT (make_date(y, m, 1) + interval '1 month - 1 day')::date
       - extract(dow FROM (make_date(y, m, 1) + interval '1 month - 1 day'))::int
$$;

CREATE OR REPLACE FUNCTION occ_next_last_sunday(m int, p_from date)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN occ_last_sunday(extract(year FROM p_from)::int, m) >= p_from
              THEN occ_last_sunday(extract(year FROM p_from)::int, m)
              ELSE occ_last_sunday(extract(year FROM p_from)::int + 1, m) END
$$;

-- Balíčky svátků (klíče stejné jako recipients.holidays)
CREATE OR REPLACE FUNCTION occ_pack_keys(p_basic boolean, p_cz boolean)
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
  SELECT (CASE WHEN p_basic THEN ARRAY['valentyn','mdz','den_matek_sns','vanoce','vanoce_prav'] ELSE ARRAY[]::text[] END)
      || (CASE WHEN p_cz THEN ARRAY['den_matek','den_ucitelu','den_otcu'] ELSE ARRAY[]::text[] END)
$$;

CREATE OR REPLACE FUNCTION occ_holiday_next(p_key text, p_from date)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_key
    WHEN 'valentyn' THEN occ_next_annual(2, 14, p_from)
    WHEN 'mdz' THEN occ_next_annual(3, 8, p_from)
    WHEN 'den_ucitelu' THEN occ_next_annual(3, 28, p_from)
    WHEN 'den_matek' THEN occ_next_nth_sunday(5, 2, p_from)
    WHEN 'den_matek_sns' THEN occ_next_last_sunday(11, p_from)
    WHEN 'den_otcu' THEN occ_next_nth_sunday(6, 3, p_from)
    WHEN 'vanoce' THEN occ_next_annual(12, 24, p_from)
    WHEN 'vanoce_prav' THEN occ_next_annual(1, 7, p_from)
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION occ_holiday_name(p_key text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_key
    WHEN 'valentyn' THEN 'Valentýn' WHEN 'mdz' THEN 'MDŽ' WHEN 'den_ucitelu' THEN 'Den učitelů'
    WHEN 'den_matek' THEN 'Den matek' WHEN 'den_matek_sns' THEN 'Den matek (SNS)'
    WHEN 'den_otcu' THEN 'Den otců' WHEN 'vanoce' THEN 'Vánoce' WHEN 'vanoce_prav' THEN 'Pravoslavné Vánoce'
    ELSE p_key END
$$;

-- Všechny nadcházející příležitosti (pro jednoho klienta nebo pro všechny), seřazené.
-- years = kolikáté narozeniny / výročí, když známe rok.
CREATE OR REPLACE FUNCTION occasion_upcoming(p_email text DEFAULT NULL, p_days int DEFAULT 400)
RETURNS TABLE(email text, occasion_key text, occasion_date date, kind text, title text,
              person text, recipient_id uuid, years int)
LANGUAGE sql STABLE AS $$
  WITH t AS (SELECT occ_prague_today() AS d0),
  -- nastavení: pro jednoho klienta i bez uloženého řádku (výchozí balíček), pro cron
  -- jen klienti, kteří si nastavení uložili (obecné svátky e-mailem jen se souhlasem)
  st AS (
    SELECT s.email, s.pack_basic, s.pack_cz, s.namedays FROM occasion_settings s
    WHERE p_email IS NULL OR s.email = lower(p_email)
    UNION ALL
    -- bez uloženého nastavení = výchozí balíček; pro cron jen ti, kdo Occasions používají
    SELECT e.email, true, false, false
    FROM (
      SELECT lower(p_email) AS email WHERE p_email IS NOT NULL
      UNION SELECT lower(owner_email) FROM recipients WHERE p_email IS NULL
      UNION SELECT lower(email) FROM personal_dates WHERE p_email IS NULL
    ) e
    WHERE e.email IS NOT NULL AND NOT EXISTS (SELECT 1 FROM occasion_settings s2 WHERE s2.email = e.email)
  ),
  pd AS (
    SELECT lower(p.email) AS email, 'pd:' || p.id AS occasion_key,
      CASE p.recurrence
        WHEN 'yearly' THEN occ_next_annual(extract(month FROM p.event_date)::int, extract(day FROM p.event_date)::int, t.d0)
        WHEN 'monthly' THEN CASE
          WHEN occ_make_date(extract(year FROM t.d0)::int, extract(month FROM t.d0)::int, extract(day FROM p.event_date)::int) >= t.d0
          THEN occ_make_date(extract(year FROM t.d0)::int, extract(month FROM t.d0)::int, extract(day FROM p.event_date)::int)
          ELSE occ_make_date(extract(year FROM (t.d0 + interval '1 month'))::int, extract(month FROM (t.d0 + interval '1 month'))::int, extract(day FROM p.event_date)::int) END
        ELSE p.event_date END AS occasion_date,
      'date' AS kind, p.label AS title, r.name AS person, p.recipient_id,
      p.event_date AS origin, p.recurrence
    FROM personal_dates p CROSS JOIN t
    LEFT JOIN recipients r ON r.id = p.recipient_id
    WHERE p_email IS NULL OR lower(p.email) = lower(p_email)
  ),
  hol AS (
    SELECT lower(r.owner_email) AS email, 'h:' || r.id || ':' || h AS occasion_key,
      occ_holiday_next(h, t.d0) AS occasion_date, 'holiday' AS kind, occ_holiday_name(h) AS title,
      r.name AS person, r.id AS recipient_id, NULL::int AS years
    FROM recipients r CROSS JOIN t CROSS JOIN LATERAL unnest(r.holidays) AS h
    WHERE (p_email IS NULL OR lower(r.owner_email) = lower(p_email)) AND occ_holiday_next(h, t.d0) IS NOT NULL
  ),
  bd AS (
    SELECT lower(r.owner_email), 'bd:' || r.id, occ_next_annual(r.birthday_month, r.birthday_day, t.d0),
      'birthday', 'Narozeniny', r.name, r.id,
      CASE WHEN r.birthday_year IS NOT NULL
        THEN extract(year FROM occ_next_annual(r.birthday_month, r.birthday_day, t.d0))::int - r.birthday_year END
    FROM recipients r CROSS JOIN t
    WHERE (p_email IS NULL OR lower(r.owner_email) = lower(p_email))
      AND r.birthday_month IS NOT NULL AND r.birthday_day IS NOT NULL
  ),
  nd AS (
    SELECT lower(r.owner_email), 'nd:' || r.id, occ_next_annual(r.nameday_month, r.nameday_day, t.d0),
      'nameday', 'Jmeniny', r.name, r.id, NULL::int
    FROM recipients r CROSS JOIN t
    JOIN st ON st.email = lower(r.owner_email) AND st.namedays
    WHERE (p_email IS NULL OR lower(r.owner_email) = lower(p_email))
      AND r.nameday_month IS NOT NULL AND r.nameday_day IS NOT NULL
  ),
  -- obecné svátky z balíčků, které nejsou už u nějakého člověka (jinak by MDŽ byl dvakrát)
  gen AS (
    SELECT st.email, 'g:' || k, occ_holiday_next(k, t.d0), 'general', occ_holiday_name(k),
      NULL::text, NULL::uuid, NULL::int
    FROM st CROSS JOIN t CROSS JOIN LATERAL unnest(occ_pack_keys(st.pack_basic, st.pack_cz)) AS k
    WHERE NOT EXISTS (SELECT 1 FROM recipients r WHERE lower(r.owner_email) = st.email AND k = ANY(r.holidays))
  ),
  allrows AS (
    SELECT pd.email, pd.occasion_key, pd.occasion_date, pd.kind, pd.title, pd.person, pd.recipient_id,
      CASE WHEN pd.recurrence = 'yearly' AND extract(year FROM pd.origin) < extract(year FROM pd.occasion_date)
        THEN (extract(year FROM pd.occasion_date) - extract(year FROM pd.origin))::int END AS years
    FROM pd
    UNION ALL SELECT * FROM hol
    UNION ALL SELECT * FROM bd
    UNION ALL SELECT * FROM nd
    UNION ALL SELECT * FROM gen
  )
  SELECT a.* FROM allrows a, t
  WHERE a.occasion_date >= t.d0 AND a.occasion_date <= t.d0 + p_days
  ORDER BY a.occasion_date, a.person NULLS LAST, a.title
$$;

-- ---------- denní rozesílka ----------
CREATE OR REPLACE FUNCTION send_occasion_reminders()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := occ_prague_today();
  v_sent int := 0;
  rec record;
BEGIN
  -- 1) hlavní připomínka: přesně lead_days předem
  FOR rec IN
    WITH due AS (
      SELECT u.*, coalesce(s.lead_days, 3) AS lead
      FROM occasion_upcoming(NULL, 31) u
      LEFT JOIN occasion_settings s ON s.email = u.email
      WHERE coalesce(s.email_enabled, true)
        AND u.occasion_date = v_today + coalesce(s.lead_days, 3)
        -- na ten den už objednávku má → nic nepřipomínáme
        AND NOT EXISTS (
          SELECT 1 FROM tilda_orders o
          WHERE lower(o.customer_email) = u.email AND o.status IS DISTINCT FROM 'cancelled'
            AND o.delivery_date BETWEEN u.occasion_date - 1 AND u.occasion_date)
    ),
    fresh AS (
      INSERT INTO occasion_reminder_log (email, occasion_key, occasion_date, kind)
      SELECT email, occasion_key, occasion_date, 'first' FROM due
      ON CONFLICT DO NOTHING
      RETURNING email, occasion_key, occasion_date
    )
    SELECT d.email, max(d.lead) AS lead,
      jsonb_agg(jsonb_build_object('key', d.occasion_key, 'date', d.occasion_date, 'kind', d.kind, 'title', d.title,
        'person', d.person, 'recipient_id', d.recipient_id, 'years', d.years,
        'budget', rr.budget, 'gift_prefs', coalesce(to_jsonb(rr.gift_prefs), '[]'::jsonb), 'autopilot', coalesce(rr.autopilot, false))
        ORDER BY d.occasion_date, d.person) AS items
    FROM due d JOIN fresh f USING (email, occasion_key, occasion_date)
    LEFT JOIN recipients rr ON rr.id = d.recipient_id
    GROUP BY d.email
  LOOP
    PERFORM notify_brevo(jsonb_build_object('event', 'occasion_reminder', 'order_id', 'occasions', 'email', rec.email,
      'days', rec.lead, 'items', rec.items));
    v_sent := v_sent + 1;
  END LOOP;

  -- 2) poslední šance: den předem, jen když od první připomínky nepřišla žádná objednávka
  FOR rec IN
    WITH due AS (
      SELECT u.*
      FROM occasion_upcoming(NULL, 2) u
      JOIN occasion_reminder_log l ON l.email = u.email AND l.occasion_key = u.occasion_key
        AND l.occasion_date = u.occasion_date AND l.kind = 'first'
      LEFT JOIN occasion_settings s ON s.email = u.email
      WHERE coalesce(s.email_enabled, true)
        AND u.occasion_date = v_today + 1
        AND coalesce(s.lead_days, 3) > 1
        -- lidi s autopilotem nepoháníme, o ty se ten den postarají manažeři (krok 3)
        AND NOT EXISTS (SELECT 1 FROM recipients rx WHERE rx.id = u.recipient_id AND rx.autopilot)
        AND NOT EXISTS (
          SELECT 1 FROM tilda_orders o
          WHERE lower(o.customer_email) = u.email AND o.status IS DISTINCT FROM 'cancelled'
            AND (o.created_at >= l.sent_at OR o.delivery_date BETWEEN u.occasion_date - 1 AND u.occasion_date))
    ),
    fresh AS (
      INSERT INTO occasion_reminder_log (email, occasion_key, occasion_date, kind)
      SELECT email, occasion_key, occasion_date, 'last_call' FROM due
      ON CONFLICT DO NOTHING
      RETURNING email, occasion_key, occasion_date
    )
    SELECT d.email,
      jsonb_agg(jsonb_build_object('key', d.occasion_key, 'date', d.occasion_date, 'kind', d.kind, 'title', d.title,
        'person', d.person, 'recipient_id', d.recipient_id, 'years', d.years,
        'budget', rr.budget, 'gift_prefs', coalesce(to_jsonb(rr.gift_prefs), '[]'::jsonb), 'autopilot', coalesce(rr.autopilot, false))
        ORDER BY d.occasion_date, d.person) AS items
    FROM due d JOIN fresh f USING (email, occasion_key, occasion_date)
    LEFT JOIN recipients rr ON rr.id = d.recipient_id
    GROUP BY d.email
  LOOP
    PERFORM notify_brevo(jsonb_build_object('event', 'occasion_last_call', 'order_id', 'occasions', 'email', rec.email,
      'days', 1, 'items', rec.items));
    v_sent := v_sent + 1;
  END LOOP;

  -- 3) autopilot: den předem, u lidí se zapnutým autopilotem, když klient nic neobjednal
  --    → úkol pro manažery v Telegramu (jednou na svátek). Platí i bez e-mailových připomínek.
  FOR rec IN
    WITH due AS (
      SELECT u.*, r.budget, r.gift_prefs, r.note, r.address, r.phone, r.name
      FROM occasion_upcoming(NULL, 2) u
      JOIN recipients r ON r.id = u.recipient_id AND r.autopilot
      WHERE u.occasion_date = v_today + 1
        AND NOT EXISTS (
          SELECT 1 FROM tilda_orders o
          WHERE lower(o.customer_email) = u.email AND o.status IS DISTINCT FROM 'cancelled'
            AND (o.created_at >= now() - interval '5 days' OR o.delivery_date BETWEEN u.occasion_date - 1 AND u.occasion_date))
    ),
    fresh AS (
      INSERT INTO occasion_reminder_log (email, occasion_key, occasion_date, kind)
      SELECT email, occasion_key, occasion_date, 'autopilot' FROM due
      ON CONFLICT DO NOTHING
      RETURNING email, occasion_key, occasion_date
    )
    SELECT d.* FROM due d JOIN fresh f USING (email, occasion_key, occasion_date)
  LOOP
    PERFORM notify_telegram_role('manager',
      '🤖 Автопилот: завтра ' || to_char(rec.occasion_date, 'DD.MM.') || ' — ' || rec.title ||
      CASE WHEN rec.years IS NOT NULL THEN ' (' || rec.years || ')' ELSE '' END ||
      E'\nДля: ' || rec.name || coalesce(', ' || nullif(rec.phone, ''), '') ||
      E'\nАдрес: ' || coalesce(nullif(rec.address, ''), '— уточнить у клиента') ||
      E'\nБюджет: ' || coalesce(rec.budget::text || ' Kč', 'не указан') ||
      E'\nЧто дарить: ' || coalesce(nullif(array_to_string(rec.gift_prefs, ', '), ''), 'на ваш выбор') ||
      coalesce(E'\nПожелания: ' || nullif(rec.note, ''), '') ||
      E'\nКлиент: ' || rec.email || ' — сам ничего не заказал. Списать с депозита, если хватает, иначе написать клиенту.');
    v_sent := v_sent + 1;
  END LOOP;

  DELETE FROM occasion_reminder_log WHERE occasion_date < v_today - 400;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION send_occasion_reminders() FROM PUBLIC, anon, authenticated;

-- Každé ráno v 7:20 (UTC 5:20 = v létě 7:20, v zimě 6:20 pražského času).
SELECT cron.unschedule('occasion-reminders-daily')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'occasion-reminders-daily');
SELECT cron.schedule('occasion-reminders-daily', '20 5 * * *', $$SELECT send_occasion_reminders()$$);

-- Data čte jen edge funkce personal-dates (service role) a cron, ne veřejný klíč webu.
REVOKE ALL ON FUNCTION occasion_upcoming(text, int) FROM PUBLIC, anon, authenticated;
