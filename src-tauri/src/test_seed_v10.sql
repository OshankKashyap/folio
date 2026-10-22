-- Test-only data for schema v10+. Never loaded by the application.
-- Records no longer have status/priority/due_date/owner columns.
INSERT INTO databases (id, name, description, icon, position) VALUES
    (1, 'Projects', 'A little structure for everything you''re building.', 'layers', 0),
    (2, 'Reading list', 'Good ideas start with a good book.', 'book', 1),
    (3, 'Ideas', 'A home for your next big thing.', 'idea', 2);

INSERT INTO saved_views (database_id, name, layout, filter_active, position)
SELECT id, 'All records', 'table', 0, 0 FROM databases;
INSERT INTO saved_views (database_id, name, layout, filter_active, position)
SELECT id, 'In progress', 'table', 1, 1 FROM databases;
INSERT INTO saved_views (database_id, name, layout, position)
SELECT id, 'By status', 'board', 2 FROM databases;

INSERT INTO records (id, database_id, name, position) VALUES
    (1,  1, 'Network monitor', 0),
    (2,  1, 'Database workspace', 1),
    (3,  1, 'Portfolio refresh', 2),
    (4,  1, 'API documentation', 3),
    (5,  1, 'CLI utilities', 4),
    (6,  1, 'Design system', 5),
    (7,  2, 'Designing Data-Intensive Applications', 0),
    (8,  2, 'The Pragmatic Programmer', 1),
    (9,  3, 'Offline-first notes', 0),
    (10, 3, 'A calmer task manager', 1);

-- Seed columns for each database (Status=status, Priority=select, Due date=date, Owner=text)
INSERT INTO columns (database_id, name, type, options, position)
SELECT id, 'Status', 'status',
    '[{"id":1,"label":"To do","emoji":"","color":"gray"},{"id":2,"label":"In progress","emoji":"","color":"blue"},{"id":3,"label":"Done","emoji":"","color":"green"}]',
    0
FROM databases;

INSERT INTO columns (database_id, name, type, options, position)
SELECT id, 'Priority', 'select',
    '[{"id":1,"label":"High","emoji":"","color":"red"},{"id":2,"label":"Medium","emoji":"","color":"orange"},{"id":3,"label":"Low","emoji":"","color":"gray"}]',
    1
FROM databases;

INSERT INTO columns (database_id, name, type, options, position)
SELECT id, 'Due date', 'date', NULL, 2
FROM databases;

INSERT INTO columns (database_id, name, type, options, position)
SELECT id, 'Owner', 'text', NULL, 3
FROM databases;

-- Seed record values matching the old test_seed.sql values
-- Projects database records
-- Status: 1=In progress, 2=To do, 3=Done
-- Priority: 1=High, 2=Medium, 3=Low
INSERT INTO record_values (record_id, column_id, value)
VALUES
    -- Record 1 (Projects): Status=In progress, Priority=High, Due=2026-10-20, Owner=Oshank
    (1, (SELECT id FROM columns WHERE database_id=1 AND name='Status'),   '{"Status":2}'),
    (1, (SELECT id FROM columns WHERE database_id=1 AND name='Priority'), '{"Select":1}'),
    (1, (SELECT id FROM columns WHERE database_id=1 AND name='Due date'), '{"Date":"2026-10-20"}'),
    (1, (SELECT id FROM columns WHERE database_id=1 AND name='Owner'),    '{"Text":"Oshank"}'),
    -- Record 2: Status=In progress, Priority=High, Due=2026-10-24, Owner=Oshank
    (2, (SELECT id FROM columns WHERE database_id=1 AND name='Status'),   '{"Status":2}'),
    (2, (SELECT id FROM columns WHERE database_id=1 AND name='Priority'), '{"Select":1}'),
    (2, (SELECT id FROM columns WHERE database_id=1 AND name='Due date'), '{"Date":"2026-10-24"}'),
    (2, (SELECT id FROM columns WHERE database_id=1 AND name='Owner'),    '{"Text":"Oshank"}'),
    -- Record 3: Status=To do, Priority=Medium, Due=2026-10-28, Owner=Oshank
    (3, (SELECT id FROM columns WHERE database_id=1 AND name='Status'),   '{"Status":1}'),
    (3, (SELECT id FROM columns WHERE database_id=1 AND name='Priority'), '{"Select":2}'),
    (3, (SELECT id FROM columns WHERE database_id=1 AND name='Due date'), '{"Date":"2026-10-28"}'),
    (3, (SELECT id FROM columns WHERE database_id=1 AND name='Owner'),    '{"Text":"Oshank"}'),
    -- Record 4: Status=Done, Priority=Medium, Due=2026-10-14, Owner=Oshank
    (4, (SELECT id FROM columns WHERE database_id=1 AND name='Status'),   '{"Status":3}'),
    (4, (SELECT id FROM columns WHERE database_id=1 AND name='Priority'), '{"Select":2}'),
    (4, (SELECT id FROM columns WHERE database_id=1 AND name='Due date'), '{"Date":"2026-10-14"}'),
    (4, (SELECT id FROM columns WHERE database_id=1 AND name='Owner'),    '{"Text":"Oshank"}'),
    -- Record 5: Status=To do, Priority=Low, Due=2026-11-02, Owner=Oshank
    (5, (SELECT id FROM columns WHERE database_id=1 AND name='Status'),   '{"Status":1}'),
    (5, (SELECT id FROM columns WHERE database_id=1 AND name='Priority'), '{"Select":3}'),
    (5, (SELECT id FROM columns WHERE database_id=1 AND name='Due date'), '{"Date":"2026-11-02"}'),
    (5, (SELECT id FROM columns WHERE database_id=1 AND name='Owner'),    '{"Text":"Oshank"}'),
    -- Record 6: Status=In progress, Priority=Medium, Due=2026-10-22, Owner=Oshank
    (6, (SELECT id FROM columns WHERE database_id=1 AND name='Status'),   '{"Status":2}'),
    (6, (SELECT id FROM columns WHERE database_id=1 AND name='Priority'), '{"Select":2}'),
    (6, (SELECT id FROM columns WHERE database_id=1 AND name='Due date'), '{"Date":"2026-10-22"}'),
    (6, (SELECT id FROM columns WHERE database_id=1 AND name='Owner'),    '{"Text":"Oshank"}'),
    -- Record 7 (Reading list): Status=In progress, Priority=High, Due=2026-10-30, Owner=Oshank
    (7, (SELECT id FROM columns WHERE database_id=2 AND name='Status'),   '{"Status":2}'),
    (7, (SELECT id FROM columns WHERE database_id=2 AND name='Priority'), '{"Select":1}'),
    (7, (SELECT id FROM columns WHERE database_id=2 AND name='Due date'), '{"Date":"2026-10-30"}'),
    (7, (SELECT id FROM columns WHERE database_id=2 AND name='Owner'),    '{"Text":"Oshank"}'),
    -- Record 8: Status=To do, Priority=Medium, Due=2026-11-05, Owner=Oshank
    (8, (SELECT id FROM columns WHERE database_id=2 AND name='Status'),   '{"Status":1}'),
    (8, (SELECT id FROM columns WHERE database_id=2 AND name='Priority'), '{"Select":2}'),
    (8, (SELECT id FROM columns WHERE database_id=2 AND name='Due date'), '{"Date":"2026-11-05"}'),
    (8, (SELECT id FROM columns WHERE database_id=2 AND name='Owner'),    '{"Text":"Oshank"}'),
    -- Record 9 (Ideas): Status=To do, Priority=High, Due=2026-10-25, Owner=Oshank
    (9, (SELECT id FROM columns WHERE database_id=3 AND name='Status'),   '{"Status":1}'),
    (9, (SELECT id FROM columns WHERE database_id=3 AND name='Priority'), '{"Select":1}'),
    (9, (SELECT id FROM columns WHERE database_id=3 AND name='Due date'), '{"Date":"2026-10-25"}'),
    (9, (SELECT id FROM columns WHERE database_id=3 AND name='Owner'),    '{"Text":"Oshank"}'),
    -- Record 10: Status=In progress, Priority=Medium, Due=2026-11-01, Owner=Oshank
    (10, (SELECT id FROM columns WHERE database_id=3 AND name='Status'),   '{"Status":2}'),
    (10, (SELECT id FROM columns WHERE database_id=3 AND name='Priority'), '{"Select":2}'),
    (10, (SELECT id FROM columns WHERE database_id=3 AND name='Due date'), '{"Date":"2026-11-01"}'),
    (10, (SELECT id FROM columns WHERE database_id=3 AND name='Owner'),    '{"Text":"Oshank"}');
