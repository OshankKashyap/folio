-- Test-only data. Never loaded by the application.
INSERT INTO databases (id, name, description, icon, position) VALUES
    (1, 'Projects', 'A little structure for everything you’re building.', 'layers', 0),
    (2, 'Reading list', 'Good ideas start with a good book.', 'book', 1),
    (3, 'Ideas', 'A home for your next big thing.', 'idea', 2);

INSERT INTO saved_views (database_id, name, layout, filter_active, position)
SELECT id, 'All records', 'table', 0, 0 FROM databases;
INSERT INTO saved_views (database_id, name, layout, filter_active, position)
SELECT id, 'In progress', 'table', 1, 1 FROM databases;
INSERT INTO saved_views (database_id, name, layout, position)
SELECT id, 'By status', 'board', 2 FROM databases;

INSERT INTO records (database_id, name, status, priority, due_date, owner, position) VALUES
    (1, 'Network monitor', 'In progress', 'High', '2026-10-20', 'Oshank', 0),
    (1, 'Database workspace', 'In progress', 'High', '2026-10-24', 'Oshank', 1),
    (1, 'Portfolio refresh', 'To do', 'Medium', '2026-10-28', 'Oshank', 2),
    (1, 'API documentation', 'Done', 'Medium', '2026-10-14', 'Oshank', 3),
    (1, 'CLI utilities', 'To do', 'Low', '2026-11-02', 'Oshank', 4),
    (1, 'Design system', 'In progress', 'Medium', '2026-10-22', 'Oshank', 5),
    (2, 'Designing Data-Intensive Applications', 'In progress', 'High', '2026-10-30', 'Oshank', 0),
    (2, 'The Pragmatic Programmer', 'To do', 'Medium', '2026-11-05', 'Oshank', 1),
    (3, 'Offline-first notes', 'To do', 'High', '2026-10-25', 'Oshank', 0),
    (3, 'A calmer task manager', 'In progress', 'Medium', '2026-11-01', 'Oshank', 1);
