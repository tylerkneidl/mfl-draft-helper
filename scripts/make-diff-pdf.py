#!/usr/bin/env python3
"""Generate a one-look PDF diffing our rookie board's positional weights against
our league's own 2019-2025 history (the Positional Value memo)."""
from reportlab.lib.pagesizes import LETTER
from reportlab.lib import colors
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table,
                                TableStyle, HRFlowable)

NAVY   = colors.HexColor('#16233f')
GREEN  = colors.HexColor('#1d8a4e'); GREENBG = colors.HexColor('#e8f6ee')
AMBER  = colors.HexColor('#b9760f'); AMBERBG = colors.HexColor('#fdf1dd')
GREY   = colors.HexColor('#5b6270'); GREYBG  = colors.HexColor('#f0f1f3')
LINE   = colors.HexColor('#d8dbe0'); MUT     = colors.HexColor('#5b6270')

ss = getSampleStyleSheet()
H1   = ParagraphStyle('H1', parent=ss['Title'], textColor=NAVY, fontSize=21, leading=24, spaceAfter=2)
SUB  = ParagraphStyle('SUB', parent=ss['Normal'], textColor=MUT, fontSize=10.5, leading=14, spaceAfter=10)
H2   = ParagraphStyle('H2', parent=ss['Heading2'], textColor=NAVY, fontSize=13, spaceBefore=14, spaceAfter=5)
BODY = ParagraphStyle('BODY', parent=ss['Normal'], fontSize=10, leading=14.5, spaceAfter=6)
CELL = ParagraphStyle('CELL', parent=ss['Normal'], fontSize=9.5, leading=12)
CELLB= ParagraphStyle('CELLB', parent=ss['Normal'], fontSize=9.5, leading=12, fontName='Helvetica-Bold')
NOTE = ParagraphStyle('NOTE', parent=ss['Normal'], fontSize=8.5, leading=11, textColor=MUT)

def verdict(txt, color):
    return Paragraph(f'<font color="#{color.hexval()[2:]}"><b>{txt}</b></font>', CELL)

story = []
story.append(Paragraph("Positional Value: Our Board vs. Our League's History", H1))
story.append(Paragraph("Rookie board weights checked against the league's own 2019&#8211;2025 "
    "record (EDSL&#8594;EFA&#8594;MLS lineage). This is <b>not</b> external validation &#8212; it's "
    "our league's empirical truth, so where the board disagrees, the board is what to question.", SUB))
story.append(HRFlowable(width='100%', color=LINE, spaceAfter=10))

# --- main table ---
story.append(Paragraph("Position hierarchy &#8212; two methods, side by side", H2))
hdr = [Paragraph(f'<b><font color="#ffffff">{h}</font></b>', CELL) for h in
       ["Pos", "League history<br/>(win-lift &#183; rank)", "Our board<br/>(LEV &#183; rank)", "Verdict"]]
rows = [
    ("RB", "19.8  &#183;  #1", "0.92  &#183;  #2", "Aligned &#8212; top winning engine", GREEN, GREENBG),
    ("LB", "18.8  &#183;  #2", "1.00  &#183;  #1", "Aligned &#8212; top winning engine", GREEN, GREENBG),
    ("TE", "14.4  &#183;  #3", "0.53  &#183;  #5", "DIVERGE &#8212; board ranks TE too low", AMBER, AMBERBG),
    ("WR", "13.0  &#183;  #4", "0.62  &#183;  #4", "Aligned", GREEN, GREENBG),
    ("S",  "10.9  &#183;  #5", "0.33  &#183;  #7", "OK &#8212; high lift, but easiest to replace late", GREY, GREYBG),
    ("QB", "10.3  &#183;  #6", "0.78  &#183;  #3", "WATCH &#8212; board's most aggressive call", AMBER, AMBERBG),
    ("DE", "7.2  &#183;  #7", "0.50  &#183;  #6", "Aligned &#8212; both fade vs. market price", GREEN, GREENBG),
    ("DT", "5.7  &#183;  #8", "0.30  &#183;  #8", "Aligned &#8212; low", GREEN, GREENBG),
    ("CB", "-2.7  &#183;  #9", "0.28  &#183;  #9", 'Aligned &#8212; "do not pay"', GREEN, GREENBG),
]
data = [hdr]
styl = [('BACKGROUND',(0,0),(-1,0),NAVY), ('TOPPADDING',(0,0),(-1,-1),6),
        ('BOTTOMPADDING',(0,0),(-1,-1),6), ('LEFTPADDING',(0,0),(-1,-1),8),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'), ('LINEBELOW',(0,0),(-1,-1),0.5,LINE),
        ('FONTSIZE',(0,0),(-1,-1),9.5)]
for i,(pos,hist,board,vd,vc,bg) in enumerate(rows, start=1):
    data.append([Paragraph(f"<b>{pos}</b>", CELLB), Paragraph(hist, CELL),
                 Paragraph(board, CELL), verdict(vd, vc)])
    styl.append(('BACKGROUND',(0,i),(-1,i),bg))
t = Table(data, colWidths=[0.5*inch, 1.55*inch, 1.4*inch, 3.05*inch])
t.setStyle(TableStyle(styl))
story.append(t)
story.append(Paragraph("Win-lift = all-play win-rate gain from a top-quartile room (memo Table 1). "
    "LEV = our positional leverage multiplier (RANKING-METHODOLOGY &#167;2.2).", NOTE))

# --- replaceability ---
story.append(Paragraph("Why it agrees: replaceability is our scarcity argument in disguise", H2))
story.append(Paragraph("The memo's <b>late-draft (R3&#8211;5) 150+ hit rate</b> is the same idea as our "
    "replacement-level math: hard to replace &#8594; draft early; easy &#8594; wait/churn.", BODY))
rep = [[Paragraph('<b><font color="#ffffff">Hard to replace late &#8212; draft early</font></b>', CELL),
        Paragraph('<b><font color="#ffffff">Easy / churn &#8212; can wait</font></b>', CELL)],
       [Paragraph("TE <b>0.0%</b> &#183; WR 2.2% &#183; LB 3.1% &#183; DT 3.3% &#183; DE 4.7% &#183; RB 5.5%", CELL),
        Paragraph("QB 8.3% &#183; S 28.5% &#183; CB <b>43.4%</b>", CELL)]]
rt = Table(rep, colWidths=[4.0*inch, 2.5*inch])
rt.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),NAVY), ('BACKGROUND',(0,1),(0,1),GREENBG),
    ('BACKGROUND',(1,1),(1,1),GREYBG), ('GRID',(0,0),(-1,-1),0.5,LINE),
    ('TOPPADDING',(0,0),(-1,-1),6), ('BOTTOMPADDING',(0,0),(-1,-1),6), ('LEFTPADDING',(0,0),(-1,-1),8)]))
story.append(rt)
story.append(Paragraph("TE is the single hardest position to replace late (0.0%) &#8212; the strongest "
    "argument that the board under-weights it.", NOTE))

# --- the diffs ---
story.append(Paragraph("Where the board should move", H2))
for head, txt, col in [
    ("1.  TE &#8212; bump it (actionable).",
     "Our own history rates TE <b>above WR</b> in winning lift and shows it's the hardest position to "
     "replace late (0.0%). The board has TE a notch <i>below</i> WR. With this league's TE-premium "
     "scoring (1.5/rec) saying the same thing, <b>raise LEV['TE'] toward/above WR and re-rank</b>. "
     "(Ranking-layer change; the app consumes whatever board it's handed.)", AMBER),
    ("2.  QB &#8212; watch Simpson at #2.",
     "History rates QB room-lift only middling (10.3) and says &#8220;buy one anchor, don't overpay for "
     "depth.&#8221; Putting <b>one</b> QB (Simpson) at #2 <i>is</i> the anchor play, so it's not a "
     "contradiction &#8212; but it's the board's most aggressive bet and the first knob to revisit.", AMBER),
    ("3.  S (safety) &#8212; no change needed.",
     "History rates S mid-pack, but it's also the second-easiest position to replace late (28.5%). For a "
     "<b>rookie</b> draft, fading rookie safeties is still right &#8212; source S cheap and late.", GREEN),
]:
    story.append(Paragraph(f'<font color="#{col.hexval()[2:]}"><b>{head}</b></font> {txt}', BODY))

story.append(Spacer(1, 4))
story.append(HRFlowable(width='100%', color=LINE, spaceAfter=8))
story.append(Paragraph("<b>Bottom line:</b> our board matches our league's own history almost everywhere "
    "&#8212; RB/LB are the engines, CB is &#8220;do not pay,&#8221; DE is a market overpay, DT/S/CB are "
    "churn. The one real fix is <b>TE, which both the history and our scoring say should rank higher.</b>", BODY))

doc = SimpleDocTemplate("docs/Positional-Value-Diff.pdf", pagesize=LETTER,
    topMargin=0.7*inch, bottomMargin=0.6*inch, leftMargin=0.7*inch, rightMargin=0.7*inch,
    title="Positional Value Diff", author="mfl-draft-helper")
doc.build(story)
print("wrote docs/Positional-Value-Diff.pdf")
