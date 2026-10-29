"""
VISHAL SINGH LMS - Business Framework Library Engine
Comprehensive MBA framework knowledge base with interactive application,
slide concept linking, and persistent note taking.
"""

import json
import uuid
from typing import Dict, Any, List, Optional
from backend.database import get_db

FRAMEWORKS_CATALOG = [
    {
        "id": "swot",
        "name": "SWOT Analysis",
        "category": "Strategy",
        "tagline": "Evaluate internal Strengths & Weaknesses against external Opportunities & Threats.",
        "components": ["Strengths (Internal)", "Weaknesses (Internal)", "Opportunities (External)", "Threats (External)"],
        "when_to_use": "Strategic planning, new market entry, annual corporate review, or turnaround diagnosis.",
        "common_pitfalls": "Creating laundry lists without prioritization; confusing internal capabilities with external market shifts.",
        "example": "Apple's SWOT: Strengths (Ecosystem lock-in, proprietary silicon); Weaknesses (High hardware price sensitivity); Opportunities (Healthcare AI, AR hardware); Threats (Antitrust scrutiny, supply chain concentration)."
    },
    {
        "id": "porter_five_forces",
        "name": "Porter's Five Forces",
        "category": "Strategy",
        "tagline": "Analyze the fundamental economic structure and long-term profitability of an industry.",
        "components": [
            "Industry Rivalry",
            "Threat of New Entrants",
            "Bargaining Power of Buyers",
            "Bargaining Power of Suppliers",
            "Threat of Substitutes"
        ],
        "when_to_use": "Evaluating industry attractiveness, M&A due diligence, understanding why certain industries earn structurally superior returns.",
        "common_pitfalls": "Static snapshot thinking without analyzing regulatory changes or network effects.",
        "example": "Airlines: Intense rivalry, high supplier power (Boeing/Airbus, jet fuel), high buyer power (price comparison engines) = structurally low margins."
    },
    {
        "id": "pestel",
        "name": "PESTEL Analysis",
        "category": "Strategy",
        "tagline": "Macro-environmental factor scanning for strategic risk and cross-border expansion.",
        "components": ["Political", "Economic", "Social", "Technological", "Environmental", "Legal"],
        "when_to_use": "Country expansion, multi-year strategic roadmap, regulatory risk modeling.",
        "common_pitfalls": "Treating factors in isolation rather than mapping interdependencies.",
        "example": "Electric Vehicles: Political (Subsidies), Economic (Battery raw materials), Social (Eco-consciousness), Tech (Fast charging), Environmental (Carbon mandates), Legal (Emissions standards)."
    },
    {
        "id": "bcg_matrix",
        "name": "BCG Growth-Share Matrix",
        "category": "Portfolio Management",
        "tagline": "Balance cash flow allocation across business units based on market growth and relative market share.",
        "components": [
            "Stars (High Growth, High Share) -> Invest for growth",
            "Cash Cows (Low Growth, High Share) -> Milk cash flows",
            "Question Marks (High Growth, Low Share) -> Decide: invest heavily or divest",
            "Dogs (Low Growth, Low Share) -> Divest or liquidate"
        ],
        "when_to_use": "Corporate capital allocation across multiple business divisions or product lines.",
        "common_pitfalls": "Assuming high market share automatically translates into high profitability.",
        "example": "Google/Alphabet: Search is a Cash Cow funding Stars (Google Cloud) and Question Marks (Waymo)."
    },
    {
        "id": "ansoff_matrix",
        "name": "Ansoff Growth Matrix",
        "category": "Marketing & Growth",
        "tagline": "Map product-market growth strategies across existing and new dimensions.",
        "components": [
            "Market Penetration (Existing Products, Existing Markets)",
            "Market Development (Existing Products, New Markets)",
            "Product Development (New Products, Existing Markets)",
            "Diversification (New Products, New Markets)"
        ],
        "when_to_use": "Formulating revenue expansion strategies and assessing organizational risk.",
        "common_pitfalls": "Pursuing unrelated diversification without transferable core competencies.",
        "example": "Coca-Cola: Diet Coke (Product Dev), Expanding to emerging markets (Market Dev), Costa Coffee acquisition (Diversification)."
    },
    {
        "id": "stp_framework",
        "name": "STP Framework",
        "category": "Marketing",
        "tagline": "Segmentation, Targeting, and Positioning for precision customer acquisition.",
        "components": [
            "Segmentation (Demographic, Psychographic, Behavioral)",
            "Targeting (Evaluating segment attractiveness & fit)",
            "Positioning (Designing unique value proposition in consumer mind)"
        ],
        "when_to_use": "Launching a new product, repositioning a plateaued brand, reducing marketing spend waste.",
        "common_pitfalls": "Defining segments too broadly or failing to defend the positioning against incumbents.",
        "example": "Volvo: Segments safety-conscious families, targets affluent suburban professionals, positions as 'The World's Safest Luxury Car'."
    },
    {
        "id": "four_ps",
        "name": "4Ps Marketing Mix",
        "category": "Marketing",
        "tagline": "Tactical execution framework across Product, Price, Place, and Promotion.",
        "components": ["Product (Features, Quality, Brand)", "Price (Strategy, Discounts, Terms)", "Place (Distribution, Logistics)", "Promotion (Advertising, PR, Sales Funnel)"],
        "when_to_use": "GTM execution, pricing revision, product rollout.",
        "common_pitfalls": "Treating the 4Ps as static silos rather than a coordinated flywheel.",
        "example": "Nike: Product (Engineered footwear), Price (Premium skimming), Place (D2C app + select retailers), Promotion (Athlete endorsements)."
    },
    {
        "id": "rice_framework",
        "name": "RICE Prioritization",
        "category": "Product Management",
        "tagline": "Data-driven scoring for product backlogs: Reach × Impact × Confidence / Effort.",
        "components": [
            "Reach (Users impacted per period)",
            "Impact (Massive=3x, High=2x, Med=1x, Low=0.5x)",
            "Confidence (100%=High, 80%=Med, 50%=Low)",
            "Effort (Person-weeks / Sprints)"
        ],
        "when_to_use": "Quarterly sprint planning, resolving engineering bandwidth conflicts.",
        "common_pitfalls": "Inflating confidence scores without actual user research or telemetry data.",
        "example": "Feature A (Reach 10k, Impact 2, Conf 80%, Effort 4 weeks = 4,000) beats Feature B (Reach 50k, Impact 0.5, Conf 50%, Effort 8 = 1,562)."
    },
    {
        "id": "moscow_method",
        "name": "MoSCoW Prioritization",
        "category": "Product Management",
        "tagline": "Clear stakeholder consensus on project requirements.",
        "components": [
            "Must Have (Critical MVP blockers)",
            "Should Have (Important but workaround exists)",
            "Could Have (Desirable nice-to-haves)",
            "Won't Have (Explicitly out of scope for this release)"
        ],
        "when_to_use": "Sprint scoping, release deadlines, client contract scope definition.",
        "common_pitfalls": "Designating 90% of requirements as 'Must Have'.",
        "example": "Fintech App v1: Must have KYC & Payment transfers; Should have biometric login; Could have dark mode; Won't have crypto trading."
    },
    {
        "id": "jtbd",
        "name": "Jobs To Be Done (JTBD)",
        "category": "Product Management",
        "tagline": "Focus on the functional, emotional, and social progress customers hire your product to achieve.",
        "components": [
            "Situation / Context ('When I...')",
            "Motivation / Need ('I want to...')",
            "Expected Progress / Outcome ('So I can...')"
        ],
        "when_to_use": "User research, discovering true competitors (e.g. Milkshakes compete with morning commute boredom).",
        "common_pitfalls": "Describing the product feature rather than the customer's desired life transformation.",
        "example": "Clayton Christensen's Milkshake study: Morning commuters hired milkshakes to keep them engaged and full during a 45-minute commute."
    },
    {
        "id": "aarrr_pirate_metrics",
        "name": "AARRR Pirate Metrics",
        "category": "Growth & Analytics",
        "tagline": "Full funnel conversion lifecycle: Acquisition, Activation, Retention, Referral, Revenue.",
        "components": [
            "Acquisition (How do users discover you?)",
            "Activation (Do users reach the 'Aha!' moment?)",
            "Retention (Do users come back regularly?)",
            "Referral (Do users tell others?)",
            "Revenue (How do you monetize user value?)"
        ],
        "when_to_use": "SaaS growth auditing, identifying conversion bottlenecks, cohort analysis.",
        "common_pitfalls": "Pouring acquisition spend into a leaky retention bucket.",
        "example": "Dropbox: Viral referral loop (free 500MB per invite) drove activation and hyper-growth at near-zero paid CAC."
    },
    {
        "id": "product_life_cycle",
        "name": "Product Life Cycle (PLC)",
        "category": "Product Management",
        "tagline": "Strategies across the 4 stages: Introduction, Growth, Maturity, Decline.",
        "components": [
            "Introduction (High investment, negative margins, market education)",
            "Growth (Rapid adoption, scaling production, defending share)",
            "Maturity (Peak cash flow, price competition, retention focus)",
            "Decline (Harvesting cash flows, rationalizing SKUs)"
        ],
        "when_to_use": "Forecasting revenue curves and planning product retirement or extension.",
        "common_pitfalls": "Prematurely harvesting a mature product that could be revitalized.",
        "example": "Smartphones are in the Maturity stage; focus has shifted from unit growth to services and ecosystem monetization."
    },
    {
        "id": "business_model_canvas",
        "name": "Business Model Canvas (BMC)",
        "category": "Strategy & Entrepreneurship",
        "tagline": "Nine building blocks capturing how an enterprise creates, delivers, and captures value.",
        "components": [
            "Customer Segments", "Value Propositions", "Channels", "Customer Relationships",
            "Revenue Streams", "Key Resources", "Key Activities", "Key Partnerships", "Cost Structure"
        ],
        "when_to_use": "Deconstructing a business model, startup pitches, competitive benchmarking.",
        "common_pitfalls": "Treating it as a static form rather than an iterative hypothesis testing tool.",
        "example": "Airbnb: Connects Hosts (Key Partners) with Travelers (Customer Segments) through a frictionless two-sided platform taking take-rate fees."
    },
    {
        "id": "mece_principle",
        "name": "MECE Principle",
        "category": "Problem Solving",
        "tagline": "Mutually Exclusive, Collectively Exhaustive problem decomposition.",
        "components": [
            "Mutually Exclusive (No overlaps between categories)",
            "Collectively Exhaustive (No gaps; covers 100% of the problem space)"
        ],
        "when_to_use": "Consulting case interviews, root cause analysis, diagnostic logic trees.",
        "common_pitfalls": "Creating ambiguous categories where one symptom belongs in multiple buckets.",
        "example": "Profitability Tree = Revenue (Price × Quantity) - Cost (Fixed Costs + Variable Costs)."
    },
    {
        "id": "root_cause_5_whys",
        "name": "Root Cause Analysis (5 Whys / Fishbone)",
        "category": "Operations & Quality",
        "tagline": "Iterative interrogative technique to drill past symptoms to the fundamental systemic cause.",
        "components": ["Problem Statement", "Iterative Whys (1 to 5)", "Root Vulnerability", "Systemic Countermeasure"],
        "when_to_use": "Incident post-mortems, operational defects, manufacturing bottlenecks.",
        "common_pitfalls": "Stopping at human error rather than uncovering process design failures.",
        "example": "Machine stopped -> Circuit breaker tripped -> Pump overheated -> Bearing seized -> Inadequate lubrication maintenance schedule."
    },
    {
        "id": "mckinsey_7s",
        "name": "McKinsey 7S Framework",
        "category": "Organizational Strategy",
        "tagline": "Organizational alignment across 3 Hard elements and 4 Soft elements.",
        "components": [
            "Hard S: Strategy, Structure, Systems",
            "Soft S: Shared Values, Style, Staff, Skills"
        ],
        "when_to_use": "Organizational redesign, post-merger integration, large-scale digital transformation.",
        "common_pitfalls": "Changing structure (re-org) without upgrading skills or shared values.",
        "example": "Satya Nadella's transformation of Microsoft: Shifted Shared Values from 'know-it-all' to 'learn-it-all' culture."
    }
]


def get_all_frameworks(category: Optional[str] = None, search: Optional[str] = None) -> List[Dict[str, Any]]:
    """Return frameworks catalog with optional filtering."""
    results = FRAMEWORKS_CATALOG
    if category and category.lower() != "all":
        results = [f for f in results if f["category"].lower() == category.lower()]
    if search:
        s = search.lower()
        results = [f for f in results if s in f["name"].lower() or s in f["tagline"].lower() or s in f["when_to_use"].lower()]
    return results


def get_framework_by_id(framework_id: str, user_id: str = "user_vishal") -> Optional[Dict[str, Any]]:
    """Retrieve full details of a framework and any saved user notes."""
    fw = next((f for f in FRAMEWORKS_CATALOG if f["id"] == framework_id), None)
    if not fw:
        return None

    fw_dict = dict(fw)
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT notes, linked_doc_id, updated_at FROM framework_notes WHERE user_id = ? AND framework_id = ?", (user_id, framework_id))
        row = cursor.fetchone()
        if row:
            fw_dict["user_notes"] = row["notes"]
            fw_dict["linked_doc_id"] = row["linked_doc_id"]
            fw_dict["notes_updated_at"] = row["updated_at"]
        else:
            fw_dict["user_notes"] = ""
            fw_dict["linked_doc_id"] = None
    return fw_dict


def save_framework_notes(framework_id: str, notes: str, linked_doc_id: Optional[str] = None, user_id: str = "user_vishal") -> Dict[str, Any]:
    """Persist user notes and link to a document for a specific framework."""
    note_id = str(uuid.uuid4())
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO framework_notes (id, user_id, framework_id, notes, linked_doc_id, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, framework_id) DO UPDATE SET
                notes = excluded.notes,
                linked_doc_id = excluded.linked_doc_id,
                updated_at = CURRENT_TIMESTAMP
        """, (note_id, user_id, framework_id, notes, linked_doc_id))
        conn.commit()

    return {"success": True, "framework_id": framework_id, "notes": notes, "linked_doc_id": linked_doc_id}
