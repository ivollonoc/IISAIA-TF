-- Actividades creadas antes de que existiera Actividad.createdAt: tomaban la fecha de la
-- migración anterior y el calendario no mostraba sus clases previas. Se usa la fecha de alta
-- del club como mejor aproximación (solo para las que quedaron con una fecha posterior).
UPDATE "Actividad" a
SET "createdAt" = c."createdAt"
FROM "Club" c
WHERE c."id" = a."clubId" AND a."createdAt" > c."createdAt";
