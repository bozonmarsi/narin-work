-- Product cards v2: data for the new product popup on the site.
--   * short "Důležité vědět" facts per flower kind (flower_genus.highlights), product can override (product_cards.highlights)
--   * product photos taken from the Tilda catalog (product_cards.images), so the popup does not have to load the Tilda product page
--   * product_accessories can hold gifts too (kind = 'gift'); the "Přidat k objednávce" slider shows ALL active accessories, the ones that fit the flower first
--   * get_product_card() v2 returns images, highlights, portion and extras
-- Texts marked as drafts for review: they are short facts written from general florist knowledge.
-- Safe to re-run.

begin;

alter table public.flower_genus  add column if not exists highlights jsonb not null default '[]'::jsonb;
alter table public.product_cards add column if not exists highlights jsonb;            -- null = use the flower kind
alter table public.product_cards add column if not exists images jsonb not null default '[]'::jsonb;

alter table public.product_accessories drop constraint if exists product_accessories_kind_check;
alter table public.product_accessories add constraint product_accessories_kind_check
  check (kind in ('secateur','scissors','vase_low','vase','kenzan','kenzan_care','postcard','gift'));

update public.flower_genus g set highlights = v.h::jsonb from (values
  ($j$pivonka$j$, $j$[{"title": "Kupujeme v pupenu", "text": "rozkvete za 2–4 dny, v chladu pomaleji"}, {"title": "Lepkavé poupě je v pořádku", "text": "nektar i mravenci jsou normální"}, {"title": "Krátká sezóna", "text": "nejvíc pivoněk je od května do června"}]$j$),
  ($j$ruze$j$, $j$[{"title": "Ohnutá hlava?", "text": "seřízněte stonek a dejte ji na hodinu do hluboké vody"}, {"title": "Listy pod vodou ven", "text": "voda zůstane déle čistá"}]$j$),
  ($j$hortenzie$j$, $j$[{"title": "Pije i květem", "text": "povadlou ponořte celou na 30 minut do studené vody"}, {"title": "Dá se usušit", "text": "v suchu zůstane krásná i po odkvětu"}]$j$),
  ($j$dahlia$j$, $j$[{"title": "Krátký, ale silný život", "text": "5–7 dní v plné kráse"}, {"title": "Vyměňujte vodu denně", "text": "jiřiny nemají rády zakalenou vodu"}]$j$),
  ($j$gerbera$j$, $j$[{"title": "Málo vody", "text": "stačí 5 cm, stonek jinak měkne"}, {"title": "Ohnutá hlava", "text": "podepřete ji na pár hodin papírem"}]$j$),
  ($j$karafiat$j$, $j$[{"title": "Jedna z nejtrvanlivějších", "text": "klidně 2–3 týdny ve váze"}, {"title": "Řežte mezi kolínky", "text": "stonek tak lépe pije"}]$j$),
  ($j$tulipan$j$, $j$[{"title": "Rostou i ve váze", "text": "za den povyrostou a otočí se za světlem"}, {"title": "Méně vody", "text": "stačí 5–10 cm studené vody"}]$j$),
  ($j$ranunculus$j$, $j$[{"title": "Jemné duté stonky", "text": "jen 5–7 cm vody"}, {"title": "Otevírá se pomalu", "text": "plně rozkvete za 1–3 dny"}]$j$),
  ($j$lilie$j$, $j$[{"title": "Velmi jedovatá pro kočky", "text": "i pyl a voda z vázy"}, {"title": "Odstraňte tyčinky", "text": "pyl barví látky"}, {"title": "Rozkvétá postupně", "text": "odkvetlé květy odstraňte"}]$j$),
  ($j$slunecnice$j$, $j$[{"title": "Těžká hlava", "text": "potřebuje vysokou a stabilní vázu"}, {"title": "Hodně pije", "text": "doplňujte vodu každý den"}]$j$),
  ($j$chryzantema$j$, $j$[{"title": "Velmi trvanlivá", "text": "2–3 týdny ve váze"}, {"title": "Listy pod vodou ven", "text": "ve vodě rychle hnijí"}]$j$),
  ($j$eustoma$j$, $j$[{"title": "Kytice se doma mění", "text": "poupata se otevírají postupně"}, {"title": "Křehké okvětí", "text": "nestavte ji do průvanu"}]$j$),
  ($j$freesia$j$, $j$[{"title": "Rozkvétá postupně", "text": "odkvetlé květy otrhejte, otevřou se další"}, {"title": "Voní nejvíc v teple", "text": "v chladu vůně slábne"}]$j$),
  ($j$matthiola$j$, $j$[{"title": "Silná sladká vůně", "text": "nejvýraznější večer"}, {"title": "Měkký stonek", "text": "vodu měňte každý den"}]$j$),
  ($j$hermanek$j$, $j$[{"title": "Lehký a vzdušný", "text": "zjemní každou kytici"}]$j$),
  ($j$eukalyptus$j$, $j$[{"title": "Voní při doteku", "text": "uvolní svěží mátovou vůni"}, {"title": "Vydrží týdny", "text": "a dá se usušit"}]$j$),
  ($j$moluccella$j$, $j$[{"title": "Zelené zvonky jsou kalichy", "text": "pravé květy jsou drobné uvnitř"}, {"title": "Usušená vydrží měsíce", "text": "zůstane krémová až béžová"}, {"title": "Dává výšku", "text": "dejte ji dozadu jako páteř kytice"}]$j$),
  ($j$eryngium$j$, $j$[{"title": "Modrý bodlák", "text": "vydrží dlouho a dá se usušit"}, {"title": "Pozor, píchá", "text": "berte ho za stonek"}]$j$),
  ($j$leucadendron$j$, $j$[{"title": "Jeden z nejtrvanlivějších", "text": "2–3 týdny ve váze"}, {"title": "Barvu dávají listeny", "text": "ne květy"}]$j$),
  ($j$kala$j$, $j$[{"title": "Elegantní tvar", "text": "stačí pár stonků v úzké váze"}, {"title": "Málo vody", "text": "5–10 cm, stonek jinak měkne"}]$j$),
  ($j$allium$j$, $j$[{"title": "Okrasný česnek", "text": "stonek může jemně vonět cibulí"}, {"title": "Vydrží dlouho", "text": "kolem dvou týdnů"}]$j$),
  ($j$delphinium$j$, $j$[{"title": "Vysoký a lehký", "text": "dodá kytici výšku"}, {"title": "Opadávají lístky", "text": "je to přirozené"}]$j$),
  ($j$hyacint$j$, $j$[{"title": "Silná vůně", "text": "jeden stačí na celý pokoj"}, {"title": "Roste i ve váze", "text": "stonek se ještě prodlouží"}]$j$),
  ($j$anturium$j$, $j$[{"title": "Lesklý květ je list", "text": "barevná část je toulec, květy sedí na klasu"}, {"title": "Vydrží 2–3 týdny", "text": "potřebuje teplo nad 15 °C"}, {"title": "Nejlíp samo", "text": "3–5 stonků v úzké vysoké váze"}]$j$),
  ($j$amarylis$j$, $j$[{"title": "Dutý stonek", "text": "podepřete ho úzkou vysokou vázou"}, {"title": "Rozkvétá postupně", "text": "každý květ v jiný den"}]$j$),
  ($j$leucospermum$j$, $j$[{"title": "Jehelníček z jižní Afriky", "text": "vydrží kolem dvou týdnů"}]$j$),
  ($j$protea$j$, $j$[{"title": "Královna exotiky", "text": "vydrží až 3 týdny"}, {"title": "Usušená zůstane krásná", "text": ""}]$j$),
  ($j$magnolie$j$, $j$[{"title": "Kvete rychle", "text": "v teple rozkvete za pár dní"}, {"title": "Silná větev", "text": "konec nařízněte, lépe pije"}]$j$),
  ($j$nerine$j$, $j$[{"title": "Třpytivé okvětí", "text": "lístky se lesknou na světle"}, {"title": "Vydrží až 2 týdny", "text": ""}]$j$)
) as v(k, h) where g.key = v.k and g.highlights = '[]'::jsonb;

update public.product_cards pc set highlights = v.h::jsonb from public.product_stickers ps, (values
  ($j$Pivoňka Sarah Bernard$j$, $j$[{"title": "Kupujeme v pupenu", "text": "rozkvete za 2–4 dny, v chladu pomaleji"}, {"title": "Jedna z nejplnějších odrůd", "text": "kulatá hlava a sladká vůně, stačí pár stonků"}, {"title": "Lepkavé poupě je v pořádku", "text": "nektar i mravenci jsou normální"}]$j$),
  ($j$Růže Bombastik spray$j$, $j$[{"title": "Víc růží na stonku", "text": "několik plných květů na jednom stonku"}, {"title": "Zaplní kytici", "text": "skvělá k pivoňkám a hortenziím"}, {"title": "Jemná vůně", "text": "nepřebije ostatní květiny"}]$j$)
) as v(n, h) where ps.id = pc.product_id and decode_html_entities(ps.product_name) = v.n and ps.archived = false and pc.highlights is null;

-- photos from the Tilda catalog (first one is the main photo)
update public.product_cards pc set images = v.i::jsonb from public.product_stickers ps, (values
  ($j$548551220284$j$, $j$["https://static.tildacdn.com/stor6436-6530-4965-a166-376661313461/57c5e65f2177f89e70a6bd31db2d4f6a.jpg", "https://static.tildacdn.com/stor6362-6334-4264-b137-333466326637/c81781f770cd37144f4cc1f12da82e28.jpg"]$j$),
  ($j$308716797514$j$, $j$["https://static.tildacdn.com/stor6263-6435-4339-b438-666535366462/70836e36ff842ccd2d4b77dc3ce9a0eb.png"]$j$),
  ($j$850474817824$j$, $j$["https://static.tildacdn.com/stor3662-6630-4933-a332-616531363430/a1a2e49d2b98670ca627aaf83d95d073.webp"]$j$),
  ($j$353040386354$j$, $j$["https://static.tildacdn.com/stor6262-3566-4638-a534-303636373937/465adba51216339fd0f4b6beae4bc138.webp"]$j$),
  ($j$751727463504$j$, $j$["https://static.tildacdn.com/stor3335-6138-4039-b661-336665353462/8142f6c953f281888298eeae6b1efb24.webp"]$j$),
  ($j$713650839914$j$, $j$["https://static.tildacdn.com/stor6565-6364-4533-b235-376636666231/7151ec15df978ab93ce8cf25ade68e8c.webp"]$j$),
  ($j$636097479844$j$, $j$["https://static.tildacdn.com/stor3963-3066-4264-a335-663161346432/d606f16243d5c2ad9ded8fdaf71fb68e.webp"]$j$),
  ($j$171700842964$j$, $j$["https://static.tildacdn.com/stor6433-3063-4264-a334-616262656433/bc257de17eeb66fb986b7fd4ef3b34c8.webp"]$j$),
  ($j$814897482974$j$, $j$["https://static.tildacdn.com/stor3537-3164-4939-b239-303437326337/1871eaa44d81b1aa45b69193737d8d74.webp"]$j$),
  ($j$965689494084$j$, $j$["https://static.tildacdn.com/stor3164-3836-4461-b637-386536336431/8575407c7720f916bed52781361c1597.jpg", "https://static.tildacdn.com/stor6139-3634-4337-a263-366461623338/795a1d9510cba7b5696107c24d59311a.jpg"]$j$),
  ($j$814926079464$j$, $j$["https://static.tildacdn.com/stor3336-3361-4261-a164-313861636638/f50872139c4b6dbd11119df081c4d23b.jpg", "https://static.tildacdn.com/stor3661-3835-4338-b563-633539393935/d3246d282b5abf25ed85b86271437c2c.jpg"]$j$),
  ($j$433298943584$j$, $j$["https://static.tildacdn.com/stor6337-3332-4335-b538-336633336636/d66792f54d3ead16c8973783258e47f0.webp"]$j$),
  ($j$617986607354$j$, $j$["https://static.tildacdn.com/stor3164-6636-4432-b332-333066626230/3cc1e0df7c93518d4bb3c7e5b4e3822f.jpg", "https://static.tildacdn.com/stor6136-3235-4834-a466-396432663537/254c0fac10f8a697a3b9b8c008ac1ecd.jpg"]$j$),
  ($j$570577802934$j$, $j$["https://static.tildacdn.com/stor3765-3139-4265-a636-363538366634/a2bd676997bf5c2d68ece3af26072c28.webp", "https://static.tildacdn.com/stor3062-3830-4631-b338-313465313764/a67a50ac147166b14a3ec842e847d1d1.jpg"]$j$),
  ($j$886242981034$j$, $j$["https://static.tildacdn.com/stor3037-3032-4639-b164-663165316131/2ae5955493ad730ce01b7c710cfe73c4.png", "https://static.tildacdn.com/stor3736-3564-4836-a166-333934626665/aad4ad2faab936c63cc9b9362efaebe3.png"]$j$),
  ($j$633022464054$j$, $j$["https://static.tildacdn.com/stor3465-6233-4233-b032-643832633039/8089f7b7d1711b7a956ed5dee7d849b0.webp"]$j$),
  ($j$711090832174$j$, $j$["https://static.tildacdn.com/stor6666-6639-4738-b966-666561306239/c702d8044a6897d00fad6031c7f5af02.webp"]$j$),
  ($j$793586616424$j$, $j$["https://static.tildacdn.com/stor3435-6163-4261-a137-343766393363/d5f7a78f734384eab16a8f11460fc5d7.webp"]$j$),
  ($j$198666273724$j$, $j$["https://static.tildacdn.com/stor6539-6466-4437-b833-363738336337/43a2368fe0032baaa0439274aeaaacd9.webp"]$j$),
  ($j$665941409814$j$, $j$["https://static.tildacdn.com/stor6333-3565-4738-a464-633837626630/1f9c095b1e8ad2217438b6bff41b7e33.jpg", "https://static.tildacdn.com/stor3738-6361-4133-b032-623430643133/94cc5afaba5f0cba8b00d32278f6667d.png"]$j$),
  ($j$457705847914$j$, $j$["https://static.tildacdn.com/stor3666-6439-4431-b534-663463336539/97274cb47bb44168628f3bacb9c791b1.webp", "https://static.tildacdn.com/stor6562-3332-4633-b139-333465376530/58d98fae0de67f0b981dce405ac3b5b6.webp"]$j$),
  ($j$352589235374$j$, $j$["https://static.tildacdn.com/stor3136-3466-4466-b239-313462663638/05eef4e306e8b8334704ea905935c687.webp", "https://static.tildacdn.com/stor3732-6235-4664-b963-326266303232/938bded25b8169433b91612611bf983b.webp"]$j$),
  ($j$617464236744$j$, $j$["https://static.tildacdn.com/stor3961-6239-4333-b130-613762626632/9aeed76262cf7a52d2f59cdd1965c7a2.webp", "https://static.tildacdn.com/stor3832-3530-4936-b864-323863643263/ef7d0fea5fe4f312740192071ce7af27.webp"]$j$),
  ($j$996371485614$j$, $j$["https://static.tildacdn.com/stor3465-3236-4739-a266-326432613333/28d8aa480e887a27c0a10752c17d19b5.webp"]$j$),
  ($j$745136945574$j$, $j$["https://static.tildacdn.com/stor3031-3263-4063-b535-313033633562/ea34c5dd88ebcfec37191d2782742d3d.webp", "https://static.tildacdn.com/stor3165-6539-4736-b332-313663396637/8812f97a9003eb8e50b00953fb2e3c71.webp"]$j$),
  ($j$503976290794$j$, $j$["https://static.tildacdn.com/stor6539-6663-4231-b063-353530663534/8b73808489191728beec8563c8963ee3.webp"]$j$),
  ($j$179778298294$j$, $j$["https://static.tildacdn.com/stor3162-3933-4531-b262-666538376639/1dbe0f0003ff25b340702fe015242ca6.png", "https://static.tildacdn.com/stor3665-6365-4838-a431-363238663530/d3ff861c5cdabb17fea86540d830ef77.png"]$j$),
  ($j$758183765004$j$, $j$["https://static.tildacdn.com/stor3038-3533-4061-b661-666535383563/2e4b1520c948ca6845f78d79748ffcae.png", "https://static.tildacdn.com/stor3832-6538-4330-b363-623261383930/a6a7e5748efccf58e871f907c836558a.png"]$j$),
  ($j$137499940354$j$, $j$["https://static.tildacdn.com/stor3739-6335-4164-a637-633332613831/3faa32fde3a80ea87df0a567c4e0e15c.webp", "https://static.tildacdn.com/stor3761-3331-4563-b931-616530313264/8de1a15b80f47a1cd61a896a4838aee8.webp"]$j$),
  ($j$740404252364$j$, $j$["https://static.tildacdn.com/stor3433-6132-4662-b365-333034666132/88dbff25fb910e353374c832b5b9110f.png", "https://static.tildacdn.com/stor6462-6336-4337-a562-376664356162/3d50500e931e113003ba01a90547d4d4.jpg"]$j$),
  ($j$648914168684$j$, $j$["https://static.tildacdn.com/stor3233-6165-4231-b931-626662363134/8b516481be00034a419b7ca34df77cd7.webp"]$j$),
  ($j$588331244394$j$, $j$["https://static.tildacdn.com/stor3335-6637-4932-b234-333039613136/fffa49f1e21763ebae8aebd8d1962901.webp"]$j$),
  ($j$161047847644$j$, $j$["https://static.tildacdn.com/stor3139-6430-4366-a534-666339353430/452bd877b4cee23f89f0e74627eeee73.webp", "https://static.tildacdn.com/stor3463-3439-4436-a661-326239363366/c52c4ab2e659ebf014acb84adde7ad26.webp"]$j$),
  ($j$842171548494$j$, $j$["https://static.tildacdn.com/stor6264-3937-4434-b537-306566313333/425b6f920935d4fa249b313eb70df380.webp", "https://static.tildacdn.com/stor6362-3834-4866-b738-356133316632/e5c67732e1f85063a982f6bb12b2b515.webp"]$j$),
  ($j$784481462704$j$, $j$["https://static.tildacdn.com/stor3331-6136-4539-a530-313963393832/5d7a357a69918311e139d5317d97e8b7.webp", "https://static.tildacdn.com/stor3065-3238-4161-a133-373732636236/19bcd913829dca9bb2ffaa17b19e97b4.webp"]$j$),
  ($j$475251790614$j$, $j$["https://static.tildacdn.com/stor3634-3439-4762-b366-383334313039/93f89947e576d0028d27f64d12af16b4.png", "https://static.tildacdn.com/stor3030-3337-4130-a463-326537623838/86ca2621da784e656d2a579738c86385.jpg"]$j$),
  ($j$640521210934$j$, $j$["https://static.tildacdn.com/stor3733-3464-4638-a239-386336326132/6b4b766264c727038806ebb82dbe8f27.jpg"]$j$),
  ($j$705294410954$j$, $j$["https://static.tildacdn.com/stor6138-3339-4238-b364-383534333136/32abc5691528a2549d4e7e3dae54f822.jpg", "https://static.tildacdn.com/stor3865-6435-4733-a538-353330656233/e71a18522484d506ce0b22b1f13bb72e.jpg"]$j$),
  ($j$635994147514$j$, $j$["https://static.tildacdn.com/stor3533-3433-4633-b935-346430653761/ef6a0b372bfef80eff63c0809bb05d2f.png", "https://static.tildacdn.com/stor6634-3662-4634-b561-313036623434/a827408220926d7d56ea848aac9794a0.png"]$j$),
  ($j$377551986494$j$, $j$["https://static.tildacdn.com/stor3764-3131-4030-b332-303033616537/09140db51d14fc49333edaa088e75b14.jpg", "https://static.tildacdn.com/stor6163-3866-4837-b665-346630313831/63f5a84750b699d27e3f187ec3e7337b.jpg"]$j$),
  ($j$583912072744$j$, $j$["https://static.tildacdn.com/stor3365-6239-4335-a630-396634666133/e443b689f75c36ce9c7e8dd8276fa3d9.webp"]$j$),
  ($j$110124804274$j$, $j$["https://static.tildacdn.com/stor6331-6430-4262-b164-313238646132/30b8ce5e53703de7e9c3dd1ef2f5a317.webp", "https://static.tildacdn.com/stor6538-6137-4133-b031-393733336563/7b9b9e9c96fff233e6e03c40860df452.png"]$j$),
  ($j$217656894354$j$, $j$["https://static.tildacdn.com/stor6139-3862-4334-b861-363863303033/c1a0363908d8165098a32ff66b5506b5.webp"]$j$),
  ($j$220149625414$j$, $j$["https://static.tildacdn.com/stor6662-3666-4633-a161-666630663834/a7732e5cdce3702182c7991b7468cf78.webp", "https://static.tildacdn.com/stor6361-3432-4636-a265-326131316437/b5f00d3077d900f49264b0b568ee24cd.png"]$j$),
  ($j$972738031644$j$, $j$["https://static.tildacdn.com/stor6135-3737-4334-a638-373665646236/0619fff0890642575f190d9a34c834b0.webp", "https://static.tildacdn.com/stor6163-3536-4564-b466-323734333839/fc54a86853dec47ed7a8f3a5ba84bfc9.webp"]$j$),
  ($j$407631212824$j$, $j$["https://static.tildacdn.com/stor3233-6662-4662-b937-623066326364/6611e7c4c7bce6f01c421e136b3ba8d9.webp", "https://static.tildacdn.com/stor3932-6139-4437-a533-346564323533/8f5f6de3e4dfcc39b149162b275973d9.webp"]$j$),
  ($j$716497270774$j$, $j$["https://static.tildacdn.com/stor6232-3532-4264-b165-323538313864/58be7524c59d645bd6f6da6532fd0853.webp"]$j$),
  ($j$127894464754$j$, $j$["https://static.tildacdn.com/stor3039-3435-4334-a564-613066363536/f4227df0b0989c006c1765462fd7f1c1.webp"]$j$),
  ($j$486735324254$j$, $j$["https://static.tildacdn.com/stor6565-6335-4939-b739-376439656235/afe9c994ee51780c8594109a14653b1c.webp", "https://static.tildacdn.com/stor3534-3939-4138-b038-356363356162/538ad1c1c283936c84b2de07bdead437.webp"]$j$),
  ($j$617387331994$j$, $j$["https://static.tildacdn.com/stor3831-3731-4532-b362-653262396362/c98922ff2bca8783750bba042a2bcc1d.webp", "https://static.tildacdn.com/stor3435-3461-4061-a164-346634613132/2956836f56987c267dacf03a94e11c36.png"]$j$),
  ($j$778723261544$j$, $j$["https://static.tildacdn.com/stor6166-3363-4235-b231-343637653965/4e1475df5409acf517ce8d393c1cd6d6.webp", "https://static.tildacdn.com/stor6239-6533-4236-b866-633036303062/837412e2d7bb5ecba102b42016383872.webp"]$j$),
  ($j$632485843534$j$, $j$["https://static.tildacdn.com/stor3661-3737-4333-b462-396638313862/b2b0c8b9fe639e59f32badb81230639e.webp"]$j$),
  ($j$780332703944$j$, $j$["https://static.tildacdn.com/stor3463-6333-4231-b266-666632643431/e781c92cb4e370a77ed174c4ed322993.webp"]$j$),
  ($j$940778073744$j$, $j$["https://static.tildacdn.com/stor6461-3965-4138-a630-326539626463/7629485b16d49c262311d895a01805e1.png", "https://static.tildacdn.com/stor3065-3834-4564-b963-306134363337/1015dead17c0aa9f2b66a4bde0219db7.webp"]$j$),
  ($j$713060849694$j$, $j$["https://static.tildacdn.com/stor6264-3762-4164-b565-383932313761/09bd88d185a0f42229f0ad969ad6df3e.png"]$j$),
  ($j$179280018114$j$, $j$["https://static.tildacdn.com/stor3930-3665-4738-b461-336262303538/a9c03f2500c059538414f218e48a9f91.webp", "https://static.tildacdn.com/stor6162-6638-4635-b935-396636313630/956ada3ec48005b954cc5f8efa6447c9.webp"]$j$),
  ($j$875039819364$j$, $j$["https://static.tildacdn.com/stor3633-6662-4934-a532-336335396433/a083ecb598c1dff6ce150d64f7426265.webp", "https://static.tildacdn.com/stor3361-3863-4562-a334-363733373534/fd4e1cee05dcc2b355e0832de777b3f0.webp"]$j$),
  ($j$984843790224$j$, $j$["https://static.tildacdn.com/stor3064-6564-4138-a230-396132626361/a4bfd9ff3549bcc72a212c1eda6dfa7d.webp", "https://static.tildacdn.com/stor6566-3633-4737-b038-363236613437/a6e0ae423e7d7b68ad4c15645dd100a1.webp"]$j$),
  ($j$429725654764$j$, $j$["https://static.tildacdn.com/stor3331-3438-4266-b365-636261353631/2149037074801fd79d39efb4cbf6b24d.webp", "https://static.tildacdn.com/stor3537-6433-4238-b538-333338346466/8a30044fec442dee540b5d30d13b86f2.webp"]$j$),
  ($j$533579528704$j$, $j$["https://static.tildacdn.com/stor3465-6331-4133-a665-633664393063/ece26955e4253b75f1395d5fcb740f78.webp", "https://static.tildacdn.com/stor6233-6163-4366-a430-396338326261/7eb9411220a14bcd2d97a5845d9b0735.webp"]$j$),
  ($j$433899122534$j$, $j$["https://static.tildacdn.com/stor3238-6564-4430-a132-313864656530/049f9b680f40c791e4e20489c098e819.webp"]$j$),
  ($j$378944187904$j$, $j$["https://static.tildacdn.com/stor6333-6138-4232-a636-633539346637/da012f2c873a3ccec51a2266fe6eab33.webp"]$j$),
  ($j$158611577824$j$, $j$["https://static.tildacdn.com/stor6233-3636-4433-b765-383761383638/8a5ac3a015e477aada6514480f2675f0.jpg"]$j$),
  ($j$339564285354$j$, $j$["https://static.tildacdn.com/stor3230-6438-4039-b762-626564643934/e9576279a57c5d137f21921252a81888.jpg"]$j$),
  ($j$177311464364$j$, $j$["https://static.tildacdn.com/stor3064-3237-4636-b862-346432393262/ff04644ddecc4453d2136f6883ba0920.webp"]$j$),
  ($j$115899135364$j$, $j$["https://static.tildacdn.com/stor3030-3734-4361-a539-316434366261/04e733c3b9c84c768159979e213881ad.webp"]$j$),
  ($j$978807406694$j$, $j$["https://static.tildacdn.com/stor6162-6463-4431-a230-636563653531/e389787a107b83ed6c1246042f6d7fa9.webp"]$j$),
  ($j$420306073564$j$, $j$["https://static.tildacdn.com/stor3538-3662-4963-b030-613436393733/73dc32fa9d0322ccf1c7f96b2c1c6d64.webp"]$j$),
  ($j$986779895264$j$, $j$["https://static.tildacdn.com/stor6631-3863-4863-a463-623465353938/42b48e00afe2ffbf90d65b8bfc62a90a.webp"]$j$),
  ($j$776369898234$j$, $j$["https://static.tildacdn.com/stor3537-3438-4131-a333-353230346264/b9f840382d1aae791cfb35632b26b1b0.webp"]$j$),
  ($j$743428321314$j$, $j$["https://static.tildacdn.com/stor3039-3765-4433-a639-306135386337/6a2347825245a331c01f0394223dbdcf.webp"]$j$)
) as v(uid, i) where ps.id = pc.product_id and ps.tilda_uid = v.uid and pc.images = '[]'::jsonb;

-- ---------------------------------------------------------------- get_product_card v2
create or replace function public.get_product_card(p_uid text)
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid; v_tool text; v_low boolean; v_tone text; v_json json;
begin
  select ps.id into v_id from product_stickers ps
   where ps.tilda_uid = p_uid and ps.archived = false and not coalesce(ps.manually_hidden, false) limit 1;
  if v_id is null then return null; end if;

  select coalesce(pc.tool, g.tool, 'scissors'),
         coalesce(g.low_vase, false) or ps.height = 'Nízké',
         case when ps.color && array['Růžová','Červená','Bílá'] then 'warm' else 'cool' end
    into v_tool, v_low, v_tone
    from product_stickers ps
    left join product_cards pc on pc.product_id = ps.id
    left join flower_genus g on g.key = coalesce(pc.genus,
         (select x.key from flower_genus x where norm_name(ps.product_name) ~ x.pattern order by x.sort limit 1))
   where ps.id = v_id;

  select json_build_object(
    'uid', ps.tilda_uid,
    'name', decode_html_entities(ps.product_name),
    'category', ps.category,
    'price', ps.price,
    'portion', ps.order_unit_size,
    'colors', ps.color,
    'height', ps.height,
    'fragrant', ps.fragrant,
    'special_order', ps.special_order,
    'images', coalesce((select c.images from product_cards c where c.product_id = ps.id), '[]'::jsonb),
    'highlights', coalesce((select c.highlights from product_cards c where c.product_id = ps.id),
                           (select g.highlights from product_cards c join flower_genus g on g.key = c.genus where c.product_id = ps.id),
                           '[]'::jsonb),
    'card', (select to_jsonb(c) - 'product_id' - 'updated_at' - 'status' - 'images' - 'highlights'
               from product_cards c where c.product_id = ps.id and c.status = 'ready'),
    'pairs', (
      select coalesce(json_agg(t order by t.score desc, t.name), '[]'::json) from (
        select ps2.tilda_uid as uid, decode_html_entities(ps2.product_name) as name, ps2.price,
               coalesce(pc2.images->>0, ps2.image_url) as image, ps2.color as colors, ps2.special_order,
               r.score, r.reasons, coalesce(pc2.role, gg.role) as role,
               row_number() over (partition by coalesce(pc2.role, gg.role) order by r.score desc, ps2.product_name) as rn
          from rank_pairs(v_id) r
          join product_stickers ps2 on ps2.id = r.product_id
          left join product_cards pc2 on pc2.product_id = ps2.id
          left join flower_genus gg on gg.key = coalesce(pc2.genus,
               (select x.key from flower_genus x where norm_name(ps2.product_name) ~ x.pattern order by x.sort limit 1))
      ) t
      where (t.role = 'filler' and t.rn <= 5) or (t.role = 'greenery' and t.rn <= 3)
         or (t.role = 'focal' and t.rn <= 3) or (t.role = 'accent' and t.rn <= 3)
    ),
    -- slider "Přidat k objednávce": every active accessory / gift, the ones that suit this flower first
    'extras', (
      select coalesce(json_agg(e order by e.fit desc, e.sort), '[]'::json) from (
        select a.tilda_uid as uid, a.kind, a.name, a.price, a.image_url as image, a.sort,
               coalesce(a.kind = v_tool or (v_low and a.kind in ('vase_low','kenzan')) or (a.kind = 'postcard' and a.tone = v_tone), false) as fit
          from product_accessories a
         where a.active and a.kind not in ('kenzan_care')
           and not (a.kind in ('secateur','scissors') and a.kind <> v_tool)
      ) e
    )
  ) into v_json
  from product_stickers ps where ps.id = v_id;

  return v_json;
end $$;

grant execute on function public.get_product_card(text) to anon, authenticated;


commit;
