-- Popup cards for the first stabilized products. Safe to run again.
insert into public.product_cards (product_id, status, description, important_note, care_steps, source, updated_at)
select s.id, 'ready', v.descr, 'Prodává se po jednom stonku, na fotografii je více stonků.', v.care::jsonb, 'owner', now()
  from (values
    ('Bavlník',
     'Stonek bavlníku s nadýchanými bílými tobolkami v hnědých kalíšcích. Stabilizovaná rostlina si uchová svůj tvar a přírodní vzhled i bez vody, takže vás bude těšit dlouhé měsíce. Krásně vynikne samostatně ve váze, s dalšími stabilizovanými květinami i v podzimní nebo zimní dekoraci.',
     '["Nedávejte do vody ani nestříkejte vodou","Držte v interiéru, stranou od vlhka","Chraňte před přímým sluncem, aby nevybledla","Prach jemně smeťte měkkým štětcem nebo ofoukněte"]'),
    ('Pampová tráva',
     'Nadýchané béžové laty pampové trávy, které dodají prostoru lehkost a klidnou přírodní eleganci. Stabilizovaná tráva si uchová svůj tvar a barvu i bez vody, takže vás bude těšit dlouhé měsíce. Sluší jí vysoká váza samostatně i větší suchá vazba.',
     '["Nedávejte do vody ani nestříkejte vodou","Držte v interiéru, stranou od vlhka","Chraňte před přímým sluncem, aby nevybledla","Prach jemně ofoukněte, laty neotírejte","Jemné laty mohou mírně pouštět, je to přirozené"]')
  ) as v(name, descr, care)
  join public.product_stickers s on s.product_name = v.name and s.category = 'stabilizovane'
on conflict (product_id) do update
  set status = 'ready', description = excluded.description, important_note = excluded.important_note,
      care_steps = excluded.care_steps, source = 'owner', updated_at = now();
