"""
VISHAL SINGH LMS - Prerequisite Gap Detector Engine
Maps conceptual dependencies across MBA domains and detects foundational knowledge gaps
when students struggle with advanced concepts.
"""

from typing import Dict, Any, List, Optional
from backend.database import get_db

CONCEPT_DEPENDENCY_GRAPH = {
    "Discounted Cash Flow (DCF)": {
        "prerequisites": ["Time Value of Money (TVM)", "Cash Flow Statement Analysis", "Cost of Capital / WACC"],
        "diagnostic_question": "If market interest rates rise by 200 bps, what is the mathematical effect on the present value of distant cash flows?"
    },
    "LTV:CAC Ratio": {
        "prerequisites": ["Unit Economics", "Customer Churn Rate", "Gross Margin Calculation"],
        "diagnostic_question": "Why does a 1% improvement in monthly retention typically yield higher enterprise value than a 1% reduction in CAC?"
    },
    "Porter's Five Forces": {
        "prerequisites": ["Microeconomics: Monopoly vs Perfect Competition", "Supplier & Buyer Elasticity", "Barriers to Entry"],
        "diagnostic_question": "What is the primary economic factor that prevents excess economic profits in an industry with zero barriers to entry?"
    },
    "Net Present Value (NPV)": {
        "prerequisites": ["Discount Rate Selection", "Working Capital Inflows", "Opportunity Cost of Capital"],
        "diagnostic_question": "Under what condition will an investment with positive cumulative accounting profits have a negative Net Present Value?"
    },
    "Economic Order Quantity (EOQ)": {
        "prerequisites": ["Inventory Carrying Costs", "Fixed vs Variable Ordering Costs", "Stockout Risk Trade-off"],
        "diagnostic_question": "At the EOQ batch size, what is the exact mathematical relationship between total annual ordering costs and annual carrying costs?"
    },
    "RICE Prioritization": {
        "prerequisites": ["User Cohort Reach Estimation", "Confidence Scoring", "Engineering Person-Week Sizing"],
        "diagnostic_question": "How does doubling the estimated engineering effort affect the prioritization score if impact and reach remain constant?"
    }
}

def analyze_student_prerequisite_gaps(user_id: str = "user_vishal", subject_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Analyze student quiz errors and low-confidence scores to pinpoint missing prerequisites."""
    with get_db() as conn:
        cursor = conn.cursor()
        # Find concepts where user scored < 70% or flagged needs revision
        cursor.execute("""
            SELECT concept_name, accuracy, completed_at
            FROM quiz_attempts
            WHERE accuracy < 70.0
            ORDER BY completed_at DESC LIMIT 20
        """)
        weak_attempts = cursor.fetchall()

    gaps = []
    seen = set()

    for att in weak_attempts:
        c_name = att["concept_name"] or "General"
        # Match with dependency graph
        for key, details in CONCEPT_DEPENDENCY_GRAPH.items():
            if key.lower() in c_name.lower() or c_name.lower() in key.lower():
                if key not in seen:
                    seen.add(key)
                    gaps.append({
                        "struggling_concept": key,
                        "recent_score": att["accuracy"],
                        "missing_prerequisites": details["prerequisites"],
                        "diagnostic_check": details["diagnostic_question"],
                        "recommended_action": f"Review foundational modules: {', '.join(details['prerequisites'])} before re-attempting."
                    })

    # If no recorded gaps yet, provide default high-yield MBA dependencies
    if not gaps:
        for key, details in list(CONCEPT_DEPENDENCY_GRAPH.items())[:3]:
            gaps.append({
                "struggling_concept": key,
                "recent_score": 100.0,
                "missing_prerequisites": details["prerequisites"],
                "diagnostic_check": details["diagnostic_question"],
                "recommended_action": "Foundations healthy. Keep practicing active recall."
            })

    return gaps
