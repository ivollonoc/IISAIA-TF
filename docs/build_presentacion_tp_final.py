"""Genera docs/presentacion-tp-final.pptx (pitch de 6 minutos: problema, usuarios, MVP y stack).

Uso: pip install python-pptx && python docs/build_presentacion_tp_final.py
"""
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.util import Inches, Pt
from lxml import etree

SALIDA = Path(__file__).parent / "presentacion-tp-final.pptx"

# Paleta: verde cancha + ámbar como acento
DARK = RGBColor(0x0E, 0x3B, 0x2E)
GREEN = RGBColor(0x1E, 0x7A, 0x4F)
LINE_DARK = RGBColor(0x2A, 0x5E, 0x4B)
MINT = RGBColor(0xE7, 0xF3, 0xEC)
ACCENT = RGBColor(0xF2, 0xA9, 0x3B)
INK = RGBColor(0x1F, 0x29, 0x33)
MUTED = RGBColor(0x5B, 0x67, 0x70)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
BORDER = RGBColor(0xD5, 0xE3, 0xDA)

HEAD = "Arial"
BODY = "Calibri"
MONO = "Courier New"

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]


# ---------- helpers ----------

def fondo(slide, color):
    fill = slide.background.fill
    fill.solid()
    fill.fore_color.rgb = color


def caja(slide, x, y, w, h, fill=None, borde=None, redondeado=True, forma=None):
    tipo = forma or (MSO_SHAPE.ROUNDED_RECTANGLE if redondeado else MSO_SHAPE.RECTANGLE)
    s = slide.shapes.add_shape(tipo, Inches(x), Inches(y), Inches(w), Inches(h))
    if tipo == MSO_SHAPE.ROUNDED_RECTANGLE:
        s.adjustments[0] = 0.08
    if fill is None:
        s.fill.background()
    else:
        s.fill.solid()
        s.fill.fore_color.rgb = fill
    if borde is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = borde
        s.line.width = Pt(1.25)
    s.shadow.inherit = False
    s.text_frame.text = ""
    return s


def _bullet(p, nivel_in=0.22):
    pPr = p._p.get_or_add_pPr()
    pPr.set("marL", str(Inches(nivel_in)))
    pPr.set("indent", str(-Inches(nivel_in)))
    for tag in ("a:buNone", "a:buChar", "a:buAutoNum"):
        for el in pPr.findall(qn(tag)):
            pPr.remove(el)
    bu = etree.SubElement(pPr, qn("a:buChar"))
    bu.set("char", "•")


def texto(slide, x, y, w, h, parrafos, size=16, color=INK, font=BODY, bold=False,
          align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, espacio=6, shape=None):
    """parrafos: str | list[str | dict(text, size, color, font, bold, bullet, italic)]"""
    if shape is None:
        shape = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = shape.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    if isinstance(parrafos, str):
        parrafos = [parrafos]
    for i, item in enumerate(parrafos):
        d = {"text": item} if isinstance(item, str) else item
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = d.get("align", align)
        p.space_after = Pt(d.get("espacio", espacio))
        if d.get("bullet"):
            _bullet(p)
        r = p.add_run()
        r.text = d["text"]
        f = r.font
        f.size = Pt(d.get("size", size))
        f.bold = d.get("bold", bold)
        f.italic = d.get("italic", False)
        f.name = d.get("font", font)
        f.color.rgb = d.get("color", color)
    return shape


def titulo(slide, txt, color=DARK, sub=None):
    texto(slide, 0.6, 0.45, 12.1, 0.8, txt, size=34, bold=True, font=HEAD, color=color)
    if sub:
        texto(slide, 0.6, 1.15, 12.1, 0.4, sub, size=16, color=MUTED if color == DARK else MINT)


def numero(slide, x, y, n, d=0.55, fill=ACCENT, color=DARK, size=18):
    c = caja(slide, x, y, d, d, fill=fill, forma=MSO_SHAPE.OVAL)
    texto(slide, 0, 0, 0, 0, str(n), size=size, bold=True, font=HEAD, color=color,
          align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, shape=c)
    return c


def flecha(slide, x1, y1, x2, y2, color=GREEN, ancho=2.0, punta=True):
    c = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = color
    c.line.width = Pt(ancho)
    if punta:
        ln = c.line._get_or_add_ln()
        tail = etree.SubElement(ln, qn("a:tailEnd"))
        tail.set("type", "triangle")
    return c


def cuatro_puntos(slide, activo, color=MUTED):
    """Recordatorio arriba a la derecha: en qué punto de la consigna estamos."""
    for i, nombre in enumerate(["Problema", "Usuarios", "MVP", "Stack"]):
        x = 8.55 + i * 1.07
        on = nombre == activo
        c = caja(slide, x, 0.55, 1.0, 0.36, fill=ACCENT if on else None, borde=None if on else BORDER)
        texto(slide, 0, 0, 0, 0, nombre, size=11, bold=on, color=DARK if on else color,
              align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, shape=c)


# ---------- 1. Portada ----------
s = prs.slides.add_slide(BLANK)
fondo(s, DARK)
# Motivo: círculo central de una cancha
ring = caja(s, 8.3, 1.0, 5.6, 5.6, forma=MSO_SHAPE.OVAL, borde=LINE_DARK)
ring.line.width = Pt(3)
caja(s, 10.95, 3.65, 0.3, 0.3, fill=LINE_DARK, forma=MSO_SHAPE.OVAL)
texto(s, 0.8, 1.9, 8, 0.4, "TP FINAL · IISAIA · FIUBA", size=14, bold=True, color=ACCENT, font=HEAD)
texto(s, 0.8, 2.4, 9, 1.2, "Gestión de Socios", size=56, bold=True, color=WHITE, font=HEAD)
texto(s, 0.8, 3.6, 8.5, 0.6, "Socios, cuotas y actividades en un solo lugar", size=24, color=MINT)
texto(s, 0.8, 4.6, 8, 0.4, "Problema · Usuarios · MVP · Stack", size=16, color=ACCENT)
s.notes_slide.notes_text_frame.text = (
    "Presentamos Gestión de Socios en cuatro puntos: qué problema resuelve, para quién es, "
    "cuál es el mínimo sin el que no sirve y con qué lo construimos. (~20 s)"
)

# ---------- 2. Problema ----------
s = prs.slides.add_slide(BLANK)
fondo(s, WHITE)
titulo(s, "El problema")
cuatro_puntos(s, "Problema")
texto(s, 0.6, 1.7, 5.6, 4.6, [
    {"text": "Los clubes chicos y medianos gestionan socios, cuotas e inscripciones con planillas y WhatsApp.",
     "size": 24, "bold": True, "color": DARK, "font": HEAD, "espacio": 18},
    {"text": "Qué resuelve", "size": 14, "bold": True, "color": GREEN, "espacio": 4},
    {"text": "Un espacio por club para administrar padrón, cobros y actividades, "
             "y autogestión para cada socio.", "size": 18, "color": INK},
])
dolores = [
    ("Información dispersa", "Padrón en planillas, pagos en el banco, inscripciones por chat."),
    ("¿Quién está al día?", "No hay una vista simple de las cuotas pendientes del mes."),
    ("Cupos sin control", "Las actividades se sobrecargan o quedan lugares sin usar."),
]
for i, (h, d) in enumerate(dolores):
    y = 1.7 + i * 1.6
    caja(s, 6.9, y, 5.85, 1.4, fill=MINT)
    numero(s, 7.15, y + 0.42, i + 1)
    texto(s, 7.95, y + 0.25, 4.6, 1.0, [
        {"text": h, "size": 18, "bold": True, "color": DARK, "font": HEAD, "espacio": 4},
        {"text": d, "size": 14, "color": MUTED},
    ])
s.notes_slide.notes_text_frame.text = (
    "Hoy un club chico tiene el padrón en una planilla, los pagos en el homebanking y las inscripciones "
    "en grupos de WhatsApp. Eso trae tres dolores: la información está dispersa, nadie sabe rápido "
    "quién está al día con la cuota, y los cupos de las actividades se controlan a mano. (~1 min)"
)

# ---------- 3. Usuarios ----------
s = prs.slides.add_slide(BLANK)
fondo(s, MINT)
titulo(s, "Para quién es", sub="Tres roles; cada club ve solo sus propios datos")
cuatro_puntos(s, "Usuarios")
usuarios = [
    ("G", "Admin general", "Quien opera la plataforma",
     "Dar de alta clubes y asignar quién los administra."),
    ("C", "Admin de club", "Secretaría o tesorería del club",
     "Tener el padrón ordenado, saber quién está al día y controlar los cupos."),
    ("S", "Socio", "Y su grupo familiar",
     "Ver su estado de cuota e inscribirse a actividades sin depender del club."),
]
for i, (letra, nombre, quien, necesita) in enumerate(usuarios):
    x = 0.6 + i * 4.15
    caja(s, x, 1.85, 3.85, 4.4, fill=WHITE, borde=BORDER)
    numero(s, x + 0.3, 2.15, letra, d=0.7, fill=DARK, color=ACCENT, size=22)
    texto(s, x + 0.3, 3.1, 3.25, 0.9, [
        {"text": nombre, "size": 22, "bold": True, "color": DARK, "font": HEAD, "espacio": 2},
        {"text": quien, "size": 14, "color": MUTED},
    ])
    texto(s, x + 0.3, 4.25, 3.25, 1.8, [
        {"text": "NECESITA", "size": 11, "bold": True, "color": GREEN, "font": HEAD, "espacio": 4},
        {"text": necesita, "size": 16, "color": INK},
    ])
s.notes_slide.notes_text_frame.text = (
    "La aplicación tiene tres tipos de usuario. El admin general opera la plataforma y da de alta clubes. "
    "El admin de club es la secretaría o tesorería: es el usuario principal y el que hoy sufre las planillas. "
    "Y el socio, que quiere ver si está al día e inscribirse solo. Es multi-tenant: "
    "cada club ve únicamente sus datos. (~1 min)"
)

# ---------- 4. MVP ----------
s = prs.slides.add_slide(BLANK)
fondo(s, WHITE)
titulo(s, "MVP", sub="Lo mínimo sin lo que la aplicación no sirve: un recorrido completo por rol")
cuatro_puntos(s, "MVP")
mvp = [
    ("Admin general", ["Crear un club (nombre + slug)", "Asignar el admin del club por email"]),
    ("Admin de club", ["Alta, edición y baja de socios", "Cuota mensual por tipo de socio",
                       "Registrar los pagos", "Actividades con cupo"]),
    ("Socio", ["Ver si está al día y su historial de pagos",
               "Inscribirse o cancelar respetando el cupo"]),
]
for i, (nombre, items) in enumerate(mvp):
    x = 0.6 + i * 3.0
    caja(s, x, 1.85, 2.8, 3.55, fill=MINT)
    texto(s, x + 0.25, 2.05, 2.35, 0.45, nombre, size=18, bold=True, color=DARK, font=HEAD)
    texto(s, x + 0.25, 2.65, 2.35, 2.7,
          [{"text": t, "bullet": True, "size": 14} for t in items], espacio=6)
texto(s, 0.6, 5.65, 8.8, 0.8, [
    {"text": "Regla clave: “al día” = sin cuotas vencidas impagas. Es la pregunta que el club no puede "
             "responder hoy.", "size": 15, "color": GREEN, "bold": True},
])
caja(s, 9.75, 1.85, 3.0, 4.4, fill=DARK)
texto(s, 10.05, 2.05, 2.45, 4.1, [
    {"text": "FUERA DEL MVP", "size": 12, "bold": True, "color": ACCENT, "font": HEAD, "espacio": 10},
    *[{"text": t, "bullet": True, "size": 14, "color": MINT, "espacio": 6} for t in [
        "Pagos online", "Mails y SMS", "Importar socios por CSV", "Reportes y gráficos",
        "Un subdominio por club", "Carnet digital"]],
])
s.notes_slide.notes_text_frame.text = (
    "El MVP no es todo lo que nos gustaría: es el mínimo para que cada rol complete su recorrido. "
    "El admin general crea el club y asigna su admin; el admin del club carga socios, define la cuota, "
    "registra pagos y arma actividades con cupo; el socio ve si está al día y se inscribe. "
    "A la derecha queda lo que dejamos afuera a propósito: suma valor, pero sin eso la app igual sirve. (~1 min 30 s)"
)

# ========== Lo que hicimos: v1 → v2 (contar el trabajo) ==========

# ---------- 5. Resumen del MVP v1 ----------
s = prs.slides.add_slide(BLANK)
fondo(s, MINT)
titulo(s, "Lo que construimos en el MVP v1",
       sub="Un recorrido completo por cada rol, multi-tenant por ruta: /c/<slug>")
roles_v1 = [
    ("G", "Admin general", ["Crea clubes (nombre + slug)", "Asigna el admin de cada club por email"]),
    ("C", "Admin de club", ["Tipos de socio y cuota mensual", "Alta, edición y baja de socios",
                            "Registra pagos del mes", "Actividades con cupo y resumen del mes"]),
    ("S", "Socio", ["Ve su estado de cuota e historial de pagos",
                    "Se inscribe o cancela respetando el cupo"]),
]
for i, (letra, nombre, items) in enumerate(roles_v1):
    x = 0.6 + i * 4.15
    caja(s, x, 1.75, 3.85, 2.95, fill=WHITE, borde=BORDER)
    numero(s, x + 0.3, 2.0, letra, d=0.6, fill=DARK, color=ACCENT, size=20)
    texto(s, x + 1.1, 2.08, 2.6, 0.5, nombre, size=20, bold=True, color=DARK, font=HEAD)
    texto(s, x + 0.3, 2.85, 3.3, 2.0,
          [{"text": t, "bullet": True, "size": 14} for t in items], espacio=5)
pilares_v1 = [
    ("ACCESO", "Login con Google (NextAuth); cada usuario con su rol por club"),
    ("DATOS", "clubId en cada tabla; “al día” = pago del mes actual"),
    ("RECORTES", "Ruta en vez de subdominio; pagos cargados por el club"),
    ("CALIDAD", "Vitest · CI en GitHub Actions · Docker y Codespaces"),
]
for i, (h, d) in enumerate(pilares_v1):
    x = 0.6 + i * 3.0833
    caja(s, x, 5.0, 2.9, 1.55, fill=DARK)
    texto(s, x + 0.25, 5.2, 2.4, 1.2, [
        {"text": h, "size": 12, "bold": True, "color": ACCENT, "font": HEAD, "espacio": 4},
        {"text": d, "size": 14, "color": WHITE},
    ])
s.notes_slide.notes_text_frame.text = (
    "En la v1 llegamos a un MVP de punta a punta: cada rol tenía su recorrido mínimo funcionando. "
    "Hicimos dos recortes conscientes, multi-tenant por ruta y cobros registrados a mano por el club, "
    "y dejamos el diseño preparado para crecer. Eso es lo que la v2 retoma."
)

# ---------- 6. De v1 a v2 ----------
s = prs.slides.add_slide(BLANK)
fondo(s, WHITE)
titulo(s, "De la v1 a la v2 en nueve etapas",
       sub="Cada etapa: spec → plan → implementación, y se cierra con tests, build y demo en verde")
stats = [
    ("9", "etapas iteradas"),
    ("11", "módulos por dominio"),
    ("13", "migraciones Prisma"),
    ("349", "tests automatizados"),
]
for i, (n, label) in enumerate(stats):
    x = 0.6 + i * 3.08
    caja(s, x, 1.85, 2.85, 1.9, fill=MINT)
    texto(s, x + 0.3, 2.0, 2.25, 1.1, n, size=54, bold=True, color=DARK, font=HEAD)
    texto(s, x + 0.3, 3.1, 2.25, 0.45, label, size=15, color=MUTED)
etapas = ["Base", "Cuenta corriente", "Calendario", "Agenda", "Notificaciones",
          "Acceso", "Socios", "Reportes", "Subdominios"]
W_ETAPA, PASO = 1.27, 1.35
flecha(s, 0.6 + W_ETAPA / 2, 4.6, 0.6 + 8 * PASO + W_ETAPA / 2, 4.6, color=BORDER, ancho=2, punta=False)
for i, nombre in enumerate(etapas):
    x = 0.6 + i * PASO
    numero(s, x + (W_ETAPA - 0.5) / 2, 4.35, i, d=0.5, fill=DARK, color=ACCENT, size=16)
    texto(s, x, 5.0, W_ETAPA, 0.7, nombre, size=13, bold=True, color=DARK,
          align=PP_ALIGN.CENTER)
texto(s, 0.6, 6.15, 12.1, 0.4,
      "Misma arquitectura de la v1 (Next.js + Prisma/Postgres + NextAuth, multi-tenant por clubId), "
      "ahora modular y con historial de migraciones.",
      size=14, color=GREEN)
s.notes_slide.notes_text_frame.text = (
    "No reescribimos: iteramos sobre la v1 en nueve etapas. Cada una tuvo su spec, su plan "
    "y su implementación, y se cerró con typecheck, tests y build en verde. "
    "La etapa 0 no cambió comportamiento: migraciones, tests de integración y modularización."
)

# ---------- 7. Cuenta corriente ----------
s = prs.slides.add_slide(BLANK)
fondo(s, WHITE)
titulo(s, "Cuenta corriente y pagos", sub="De “un pago por mes” a cargos y pagos por socio")
flujo = [
    ("Cargos", "Cuota social mensual\nClase o evento con precio"),
    ("Pago", "Online (pasarela simulada)\no en ventanilla"),
    ("Cuenta del club", "Acreditaciones derivadas\nde los pagos"),
]
for i, (h, d) in enumerate(flujo):
    x = 0.6 + i * 4.15
    fill = DARK if i == 1 else MINT
    caja(s, x, 1.85, 3.85, 1.75, fill=fill)
    texto(s, x + 0.3, 1.95, 3.25, 1.55, [
        {"text": h, "size": 20, "bold": True, "color": WHITE if i == 1 else DARK, "font": HEAD, "espacio": 6},
        {"text": d, "size": 14, "color": MINT if i == 1 else MUTED},
    ], align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    if i < 2:
        flecha(s, x + 3.9, 2.72, x + 4.1, 2.72)
reglas = [
    ("Al día", "Sin cargos vencidos impagos. El vencimiento es configurable por club (día 1 a 28)."),
    ("Grupo familiar", "Un titular y sus familiares: solo el titular paga, y cada cargo se acredita "
                       "en la cuenta de su socio."),
    ("Pasarela enchufable", "Interfaz Pasarela: simulada con tarjetas de prueba; "
                            "Mercado Pago queda como esqueleto."),
]
for i, (h, d) in enumerate(reglas):
    x = 0.6 + i * 4.15
    caja(s, x, 4.0, 3.85, 2.7, fill=WHITE, borde=BORDER)
    numero(s, x + 0.3, 4.3, i + 1)
    texto(s, x + 0.3, 5.05, 3.25, 1.5, [
        {"text": h, "size": 18, "bold": True, "color": DARK, "font": HEAD, "espacio": 4},
        {"text": d, "size": 14, "color": INK},
    ])
s.notes_slide.notes_text_frame.text = (
    "El modelo de pagos de la v1 quedó chico. Ahora cada socio tiene una cuenta corriente con cargos "
    "y pagos; el club ve sus acreditaciones. Se pagan cargos completos, online con una pasarela "
    "simulada o en ventanilla. El titular de un grupo familiar paga por todos."
)

# ---------- 8. Agenda y reservas ----------
s = prs.slides.add_slide(BLANK)
fondo(s, WHITE)
titulo(s, "Agenda única con reserva por clase")
# Mini vista semanal (motivo visual de la agenda)
gx, gy, gw, gh = 0.6, 1.55, 5.9, 4.75
caja(s, gx, gy, gw, gh, fill=MINT)
dias = ["L", "M", "M", "J", "V", "S", "D"]
cw = (gw - 0.4) / 7
for i, d in enumerate(dias):
    texto(s, gx + 0.2 + i * cw, gy + 0.2, cw, 0.3, d, size=13, bold=True, color=GREEN,
          align=PP_ALIGN.CENTER)
bloques = [  # (día, desde, alto, texto, relleno)
    (0, 0.4, 0.8, "Natación", DARK), (2, 0.4, 0.8, "Natación", DARK),
    (1, 1.5, 0.8, "Yoga\nlleno", ACCENT), (3, 1.5, 0.8, "Yoga\nlleno", ACCENT),
    (4, 2.6, 0.8, "Funcional", DARK), (5, 0.9, 1.1, "Clínica", GREEN),
    (2, 2.6, 0.8, "Sin\nclase", WHITE),
]
for dia, desde, alto, txt, fill in bloques:
    b = caja(s, gx + 0.24 + dia * cw, gy + 0.65 + desde, cw - 0.08, alto, fill=fill,
             borde=BORDER if fill == WHITE else None)
    texto(s, 0, 0, 0, 0, txt, size=10, bold=True,
          color=DARK if fill in (ACCENT, WHITE) else WHITE,
          align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE, shape=b)
texto(s, gx + 0.25, gy + 4.15, gw - 0.5, 0.4, "Vistas semana · mes · lista, sin librería de calendario",
      size=12, color=MUTED)
items = [
    ("Actividades", "Varios horarios semanales, inicio y fin. Las clases se calculan; "
                    "solo se guardan suspensiones y reprogramaciones."),
    ("Eventos", "Puntuales, con inscripción, cupo y precio opcionales."),
    ("Reserva por clase", "Cupo por clase; clases sueltas o un horario por N semanas. "
                          "Si tiene precio, genera un cargo."),
    ("Lista de espera", "Al liberarse un lugar se avisa a toda la lista; nadie entra solo."),
]
for i, (h, d) in enumerate(items):
    y = 1.55 + i * 1.22
    numero(s, 6.95, y + 0.05, i + 1)
    texto(s, 7.75, y, 5.0, 1.15, [
        {"text": h, "size": 18, "bold": True, "color": DARK, "font": HEAD, "espacio": 2},
        {"text": d, "size": 14, "color": INK},
    ])
s.notes_slide.notes_text_frame.text = (
    "Unificamos actividades y calendario en una sola agenda. Las clases no se guardan: se calculan "
    "desde los horarios y solo persistimos las excepciones. Pasamos de inscripción mensual a reserva "
    "por clase, con cupo, lista de espera y precio por clase."
)

# ---------- 9. Más en la v2 ----------
s = prs.slides.add_slide(BLANK)
fondo(s, MINT)
titulo(s, "Y además, en la v2", sub="Lo que dejamos fuera del MVP, ya construido")
extras = [
    ("Notificaciones", "In-app siempre; mail y SMS según active cada club. Pago acreditado, "
                       "clase suspendida, lugar liberado."),
    ("Ingreso sin clave", "Link mágico por mail (15 min, un solo uso) e invitaciones "
                               "al crear un club o un socio."),
    ("Socios en bloque", "Importar CSV con vista previa y confirmación todo o nada; "
                         "grupo familiar con un titular que paga."),
    ("Reportes", "Socios al día, emitido vs. cobrado, morosidad, ocupación y puntaje de actividades."),
    ("Subdominios", "demo.clubdesocios.com.ar: un middleware reescribe a /c/<slug>; "
                               "el modelo de datos no se tocó."),
    ("Arquitectura modular", "11 módulos por dominio; pasarela y canales detrás de interfaces "
                             "para pasar de simulado a real."),
]
for i, (h, d) in enumerate(extras):
    col, fila = i % 3, i // 3
    x, y = 0.6 + col * 4.15, 1.85 + fila * 2.45
    caja(s, x, y, 3.85, 2.2, fill=WHITE, borde=BORDER)
    numero(s, x + 0.3, y + 0.3, i + 1)
    texto(s, x + 1.0, y + 0.38, 2.75, 0.5, h, size=16, bold=True, color=DARK, font=HEAD)
    texto(s, x + 0.3, y + 1.0, 3.25, 1.15, d, size=14, color=INK)
s.notes_slide.notes_text_frame.text = (
    "El resto de la v2 en una pasada: notificaciones in-app, por mail y SMS; ingreso sin contraseñas con "
    "link mágico; carga de socios por CSV y grupos familiares; reportes del club; un subdominio por club, "
    "que en la v1 habíamos dejado como recorte; y todo organizado en módulos, con lo externo detrás "
    "de interfaces para conectar proveedores reales."
)

# ---------- 10. Stack ----------
s = prs.slides.add_slide(BLANK)
fondo(s, WHITE)
titulo(s, "Stack", sub="Un solo repo y un solo lenguaje, TypeScript, de punta a punta")
cuatro_puntos(s, "Stack")
capas = [
    ("Interfaz", ["Next.js 15 (App Router)", "React 19", "Tailwind CSS 4", "Recharts para gráficos"]),
    ("Servidor", ["Server actions y route handlers de Next.js", "NextAuth: ingreso con link por mail",
                  "Zod para validar entradas"]),
    ("Datos", ["PostgreSQL (Neon)", "Prisma ORM con migraciones", "Multi-tenant: clubId en cada tabla"]),
]
for i, (h, items) in enumerate(capas):
    x = 0.6 + i * 4.15
    fill = DARK if i == 1 else MINT
    caja(s, x, 1.85, 3.85, 3.4, fill=fill)
    texto(s, x + 0.3, 2.1, 3.25, 0.5, h.upper(), size=14, bold=True,
          color=ACCENT if i == 1 else GREEN, font=HEAD)
    texto(s, x + 0.3, 2.7, 3.25, 2.4,
          [{"text": t, "bullet": True, "size": 16, "color": WHITE if i == 1 else INK} for t in items],
          espacio=8)
    if i < 2:
        flecha(s, x + 3.9, 3.55, x + 4.1, 3.55)
caja(s, 0.6, 5.55, 12.15, 0.95, fill=WHITE, borde=BORDER)
texto(s, 0.9, 5.55, 11.6, 0.95, [
    {"text": "Deploy en Vercel  ·  CI en GitHub Actions  ·  Tests con Vitest  ·  Docker y Codespaces para desarrollo",
     "size": 16, "color": DARK, "bold": True},
], anchor=MSO_ANCHOR.MIDDLE, align=PP_ALIGN.CENTER)
s.notes_slide.notes_text_frame.text = (
    "La interfaz está hecha con Next.js y React, estilada con Tailwind. El servidor es el mismo Next.js: "
    "server actions y route handlers, con NextAuth para el ingreso y Zod para validar. Los datos están en "
    "PostgreSQL con Prisma; cada tabla lleva clubId, así un solo deploy atiende a todos los clubes. "
    "Elegimos un único lenguaje para no mantener dos proyectos separados. (~1 min)"
)

# ---------- 11. Cierre ----------
s = prs.slides.add_slide(BLANK)
fondo(s, DARK)
titulo(s, "En resumen", color=WHITE)
resumen = [
    ("Problema", "Clubes que gestionan socios y cuotas con planillas y chats"),
    ("Usuarios", "Admin general, admin de club y socio"),
    ("MVP", "Padrón, cuota, pagos y actividades con cupo; el socio ve si está al día"),
    ("Stack", "Next.js + React · NextAuth · PostgreSQL + Prisma"),
]
for i, (h, d) in enumerate(resumen):
    x = 0.6 + i * 3.08
    caja(s, x, 1.75, 2.85, 3.3, fill=LINE_DARK)
    numero(s, x + 0.3, 2.05, i + 1)
    texto(s, x + 0.3, 2.9, 2.3, 2.0, [
        {"text": h, "size": 20, "bold": True, "color": WHITE, "font": HEAD, "espacio": 8},
        {"text": d, "size": 15, "color": MINT},
    ])
texto(s, 0.6, 5.6, 12, 0.5, "¡Gracias! ¿Preguntas?", size=24, bold=True, color=WHITE, font=HEAD)
texto(s, 0.6, 6.2, 12, 0.4, "github.com/ivollonoc/IISAIA-TF  ·  clubdesocios.com.ar",
      size=16, color=ACCENT, font=MONO, bold=True)
s.notes_slide.notes_text_frame.text = (
    "Cerramos con los cuatro puntos: el problema, los tres usuarios, el MVP y el stack. "
    "La app está publicada en clubdesocios.com.ar. ¡Gracias! (~30 s)"
)

prs.save(SALIDA)
print(f"OK -> {SALIDA}")
