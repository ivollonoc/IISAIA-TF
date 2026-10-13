import { describe, expect, it } from "vitest";
import { parsearCsv } from "@/modules/socios/csv";

describe("parsearCsv", () => {
  it("lee encabezado y filas separados por coma", () => {
    expect(parsearCsv("nombre,apellido,dni\nAna,Paz,30111222\nBeto,Gil,30111223")).toEqual({
      encabezado: ["nombre", "apellido", "dni"],
      filas: [["Ana", "Paz", "30111222"], ["Beto", "Gil", "30111223"]],
    });
  });

  it("detecta punto y coma (Excel en español), ignora el BOM, los CRLF y las líneas vacías", () => {
    expect(parsearCsv("﻿Nombre;Apellido\r\nAna;Paz\r\n\r\n  \r\nBeto;Gil\r\n")).toEqual({
      encabezado: ["nombre", "apellido"],
      filas: [["Ana", "Paz"], ["Beto", "Gil"]],
    });
  });

  it("respeta campos entre comillas con separadores, comillas dobles y saltos de línea", () => {
    const texto = 'nombre,apellido,nota\n"Ana, María","O""Brien","línea 1\nlínea 2"\n';
    expect(parsearCsv(texto).filas).toEqual([["Ana, María", 'O"Brien', "línea 1\nlínea 2"]]);
  });

  it("recorta espacios y normaliza el encabezado (minúsculas, sin acentos)", () => {
    expect(parsearCsv(" Nombre , APELLIDO , Teléfono \n Ana , Paz , 11 ").encabezado).toEqual(["nombre", "apellido", "telefono"]);
    expect(parsearCsv(" Nombre , APELLIDO , Teléfono \n Ana , Paz , 11 ").filas).toEqual([["Ana", "Paz", "11"]]);
  });

  it("un texto vacío no tiene filas", () => {
    expect(parsearCsv("")).toEqual({ encabezado: [], filas: [] });
  });
});
