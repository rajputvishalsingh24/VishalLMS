"""
VISHAL SINGH LMS - Deterministic MBA Quantitative Calculator Engine
Provides mathematically exact computations and step-by-step breakdowns for:
1. Customer Lifetime Value (LTV) & LTV:CAC Ratio
2. Net Present Value (NPV) & Payback Period
3. Break-Even Quantity & Contribution Margin
4. Return on Investment (ROI) & DuPont Return on Equity (ROE)
5. Economic Order Quantity (EOQ) & Inventory Turnover
6. RICE Prioritization Score
7. Weighted Average Cost of Capital (WACC)
"""

import math
from typing import Dict, Any, List

def calculate_ltv_cac(
    arpu: float,
    gross_margin_pct: float,
    monthly_churn_pct: float,
    cac: float
) -> Dict[str, Any]:
    """
    Computes Customer Lifetime Value and LTV:CAC ratio.
    Formula:
      LTV = (ARPU * Gross Margin %) / Churn Rate
      LTV:CAC = LTV / CAC
    """
    if arpu <= 0:
        raise ValueError("ARPU must be greater than zero.")
    if gross_margin_pct <= 0 or gross_margin_pct > 100:
        raise ValueError("Gross margin % must be between 1 and 100.")
    if monthly_churn_pct <= 0 or monthly_churn_pct >= 100:
        raise ValueError("Monthly churn % must be between 0.1 and 99.9.")
    if cac <= 0:
        raise ValueError("CAC must be greater than zero.")

    margin_decimal = gross_margin_pct / 100.0
    churn_decimal = monthly_churn_pct / 100.0

    customer_lifetime_months = 1.0 / churn_decimal
    gross_profit_per_user_month = arpu * margin_decimal
    ltv = gross_profit_per_user_month * customer_lifetime_months
    ltv_cac_ratio = ltv / cac

    health_status = "Exceptional" if ltv_cac_ratio >= 4.0 else (
        "Healthy (SaaS Benchmark)" if ltv_cac_ratio >= 3.0 else (
            "Caution (Marginal Unit Economics)" if ltv_cac_ratio >= 1.5 else "Critical Deficit (Loss Making)"
        )
    )

    steps = [
        f"1. Customer Lifetime (Months) = 1 / Churn = 1 / {churn_decimal:.4f} = {customer_lifetime_months:.1f} months",
        f"2. Gross Profit per User / Month = ARPU (${arpu:.2f}) × Gross Margin ({gross_margin_pct}%) = ${gross_profit_per_user_month:.2f}",
        f"3. LTV = ${gross_profit_per_user_month:.2f} × {customer_lifetime_months:.1f} = ${ltv:.2f}",
        f"4. LTV:CAC Ratio = ${ltv:.2f} / ${cac:.2f} = {ltv_cac_ratio:.2f}x"
    ]

    return {
        "formula_name": "LTV:CAC Unit Economics",
        "ltv": round(ltv, 2),
        "cac": round(cac, 2),
        "ltv_cac_ratio": round(ltv_cac_ratio, 2),
        "customer_lifetime_months": round(customer_lifetime_months, 1),
        "gross_profit_per_month": round(gross_profit_per_user_month, 2),
        "health_status": health_status,
        "calculation_steps": steps,
        "strategic_recommendation": (
            "Aggressively scale growth spend across proven acquisition channels."
            if ltv_cac_ratio >= 3.0 else
            "Optimize onboarding and reduce early churn before expanding paid acquisition."
        )
    }


def calculate_npv_payback(
    initial_investment: float,
    discount_rate_pct: float,
    cash_flows: List[float]
) -> Dict[str, Any]:
    """
    Computes Net Present Value (NPV) and Simple / Discounted Payback Period.
    Formula:
      NPV = Sum(CF_t / (1 + r)^t) - C_0
    """
    if initial_investment <= 0:
        raise ValueError("Initial investment must be greater than zero.")
    if discount_rate_pct < 0:
        raise ValueError("Discount rate % cannot be negative.")
    if not cash_flows:
        raise ValueError("At least one annual cash flow is required.")

    r = discount_rate_pct / 100.0
    discounted_flows = []
    cumulative_undiscounted = 0.0
    cumulative_discounted = 0.0
    payback_period_years = None
    discounted_payback_years = None

    steps = [f"Initial Outlay (Year 0) = -${initial_investment:,.2f} at r = {discount_rate_pct}%"]

    for t, cf in enumerate(cash_flows, start=1):
        df = cf / ((1.0 + r) ** t)
        discounted_flows.append(df)

        prev_undisc = cumulative_undiscounted
        cumulative_undiscounted += cf
        if payback_period_years is None and cumulative_undiscounted >= initial_investment:
            fraction = (initial_investment - prev_undisc) / cf if cf > 0 else 0
            payback_period_years = round((t - 1) + fraction, 2)

        prev_disc = cumulative_discounted
        cumulative_discounted += df
        if discounted_payback_years is None and cumulative_discounted >= initial_investment:
            fraction = (initial_investment - prev_disc) / df if df > 0 else 0
            discounted_payback_years = round((t - 1) + fraction, 2)

        steps.append(f"Year {t}: CF = ${cf:,.2f} -> Present Value = ${cf:,.2f} / (1+{r:.3f})^{t} = ${df:,.2f}")

    npv = cumulative_discounted - initial_investment
    steps.append(f"Total Discounted Cash Inflows = ${cumulative_discounted:,.2f}")
    steps.append(f"NPV = ${cumulative_discounted:,.2f} - ${initial_investment:,.2f} = ${npv:,.2f}")

    decision = "ACCEPT PROJECT (Creates Shareholder Value)" if npv > 0 else "REJECT PROJECT (Destroys Value)"

    return {
        "formula_name": "Net Present Value & Payback Analysis",
        "initial_investment": round(initial_investment, 2),
        "npv": round(npv, 2),
        "decision": decision,
        "payback_years": payback_period_years if payback_period_years is not None else "Exceeds Forecast Horizon",
        "discounted_payback_years": discounted_payback_years if discounted_payback_years is not None else "Exceeds Forecast Horizon",
        "total_discounted_inflows": round(cumulative_discounted, 2),
        "calculation_steps": steps,
        "strategic_recommendation": (
            f"The proposal delivers a net value addition of ${npv:,.2f} over the capital hurdle rate of {discount_rate_pct}%."
            if npv > 0 else
            f"The proposal generates an economic loss of ${abs(npv):,.2f} against the required {discount_rate_pct}% return."
        )
    }


def calculate_breakeven(
    fixed_costs: float,
    selling_price_per_unit: float,
    variable_cost_per_unit: float,
    expected_sales_units: float = 0
) -> Dict[str, Any]:
    """
    Computes Break-Even Point (Units and Revenue) and Margin of Safety.
    Formula:
      Contribution Margin = Price - Variable Cost
      Break-Even Units = Fixed Costs / Contribution Margin
    """
    if fixed_costs <= 0:
        raise ValueError("Fixed costs must be greater than zero.")
    if selling_price_per_unit <= variable_cost_per_unit:
        raise ValueError("Selling price per unit must be greater than variable cost per unit.")

    cm = selling_price_per_unit - variable_cost_per_unit
    cm_ratio = cm / selling_price_per_unit
    be_units = fixed_costs / cm
    be_revenue = be_units * selling_price_per_unit

    margin_of_safety_pct = 0.0
    if expected_sales_units > be_units:
        margin_of_safety_pct = ((expected_sales_units - be_units) / expected_sales_units) * 100.0

    steps = [
        f"1. Unit Contribution Margin = ${selling_price_per_unit:.2f} - ${variable_cost_per_unit:.2f} = ${cm:.2f}",
        f"2. Contribution Margin Ratio = ${cm:.2f} / ${selling_price_per_unit:.2f} = {cm_ratio * 100:.1f}%",
        f"3. Break-Even Units = ${fixed_costs:,.2f} / ${cm:.2f} = {math.ceil(be_units):,} units",
        f"4. Break-Even Revenue = {math.ceil(be_units):,} × ${selling_price_per_unit:.2f} = ${be_revenue:,.2f}"
    ]
    if expected_sales_units > 0:
        steps.append(f"5. Margin of Safety at {expected_sales_units:,} units = {margin_of_safety_pct:.1f}%")

    return {
        "formula_name": "Cost-Volume-Profit & Break-Even Analysis",
        "contribution_margin_per_unit": round(cm, 2),
        "contribution_margin_ratio_pct": round(cm_ratio * 100, 2),
        "breakeven_units": math.ceil(be_units),
        "breakeven_revenue": round(be_revenue, 2),
        "margin_of_safety_pct": round(margin_of_safety_pct, 1),
        "calculation_steps": steps,
        "strategic_recommendation": (
            f"The business covers all operating fixed overhead at {math.ceil(be_units):,} units (${be_revenue:,.2f} revenue). Every unit sold beyond this yields pure profit of ${cm:.2f}."
        )
    }


def calculate_eoq_inventory(
    annual_demand: float,
    order_cost_per_order: float,
    holding_cost_per_unit_year: float
) -> Dict[str, Any]:
    """
    Computes Economic Order Quantity (EOQ), optimal orders per year, and total cost.
    Formula:
      EOQ = Sqrt((2 * D * S) / H)
    """
    if annual_demand <= 0 or order_cost_per_order <= 0 or holding_cost_per_unit_year <= 0:
        raise ValueError("Annual demand, ordering cost, and holding cost must all be positive.")

    eoq = math.sqrt((2.0 * annual_demand * order_cost_per_order) / holding_cost_per_unit_year)
    orders_per_year = annual_demand / eoq
    annual_ordering_cost = orders_per_year * order_cost_per_order
    annual_holding_cost = (eoq / 2.0) * holding_cost_per_unit_year
    total_inventory_cost = annual_ordering_cost + annual_holding_cost

    steps = [
        f"1. EOQ Formula = Sqrt((2 × {annual_demand:,.0f} × ${order_cost_per_order:.2f}) / ${holding_cost_per_unit_year:.2f})",
        f"2. Optimal Order Quantity = {round(eoq):,} units per batch",
        f"3. Orders per Year = {annual_demand:,.0f} / {round(eoq):,} = {orders_per_year:.1f} orders/year",
        f"4. Total Annual Cost (Ordering + Carrying) = ${total_inventory_cost:,.2f}"
    ]

    return {
        "formula_name": "Economic Order Quantity (EOQ) Optimization",
        "optimal_order_quantity_units": round(eoq),
        "orders_per_year": round(orders_per_year, 1),
        "annual_ordering_cost": round(annual_ordering_cost, 2),
        "annual_holding_cost": round(annual_holding_cost, 2),
        "total_inventory_cost": round(total_inventory_cost, 2),
        "calculation_steps": steps,
        "strategic_recommendation": (
            f"Placing {round(orders_per_year, 1)} batch orders of {round(eoq):,} units minimizes combined stockout, re-ordering, and warehouse holding expenses."
        )
    }


def calculate_rice_score(
    reach: float,
    impact: float,
    confidence_pct: float,
    effort_person_weeks: float
) -> Dict[str, Any]:
    """
    Computes RICE Prioritization Score for Product Managers.
    Formula:
      RICE = (Reach * Impact * Confidence %) / Effort
    """
    if reach <= 0 or effort_person_weeks <= 0:
        raise ValueError("Reach and Effort must be greater than zero.")
    if impact not in [0.25, 0.5, 1.0, 2.0, 3.0]:
        impact = max(0.25, min(3.0, impact))
    if confidence_pct <= 0 or confidence_pct > 100:
        confidence_pct = max(10, min(100, confidence_pct))

    conf_decimal = confidence_pct / 100.0
    score = (reach * impact * conf_decimal) / effort_person_weeks

    steps = [
        f"1. Reach = {reach:,} target users impacted per quarter",
        f"2. Impact Multiplier = {impact}x (Massive=3x, High=2x, Medium=1x, Low=0.5x, Minimal=0.25x)",
        f"3. Confidence = {confidence_pct}% ({conf_decimal:.2f})",
        f"4. Effort = {effort_person_weeks} person-weeks",
        f"5. RICE Score = ({reach:,} × {impact} × {conf_decimal:.2f}) / {effort_person_weeks} = {score:.1f}"
    ]

    return {
        "formula_name": "RICE Product Prioritization",
        "rice_score": round(score, 1),
        "reach": reach,
        "impact": impact,
        "confidence_pct": confidence_pct,
        "effort_person_weeks": effort_person_weeks,
        "calculation_steps": steps,
        "strategic_recommendation": (
            "High Priority initiative — high reach and conviction relative to engineering overhead."
            if score >= 500 else
            "Moderate Priority — consider reducing scope to improve the effort divisor before committing sprint capacity."
        )
    }


def calculate_wacc(
    market_value_equity: float,
    market_value_debt: float,
    cost_of_equity_pct: float,
    cost_of_debt_pct: float,
    tax_rate_pct: float
) -> Dict[str, Any]:
    """
    Computes Weighted Average Cost of Capital (WACC).
    Formula:
      WACC = (E/V * Re) + (D/V * Rd * (1 - Tc))
    """
    total_val = market_value_equity + market_value_debt
    if total_val <= 0:
        raise ValueError("Total firm market value must be positive.")

    we = market_value_equity / total_val
    wd = market_value_debt / total_val
    re = cost_of_equity_pct / 100.0
    rd = cost_of_debt_pct / 100.0
    tc = tax_rate_pct / 100.0

    after_tax_debt = rd * (1.0 - tc)
    wacc = (we * re) + (wd * after_tax_debt)
    wacc_pct = wacc * 100.0

    steps = [
        f"1. Total Firm Value (V) = Equity (${market_value_equity:,.0f}) + Debt (${market_value_debt:,.0f}) = ${total_val:,.0f}",
        f"2. Equity Weight (E/V) = {we * 100:.1f}%, Debt Weight (D/V) = {wd * 100:.1f}%",
        f"3. After-Tax Cost of Debt = {cost_of_debt_pct:.2f}% × (1 - {tax_rate_pct}%) = {after_tax_debt * 100:.2f}%",
        f"4. WACC = ({we:.3f} × {cost_of_equity_pct:.2f}%) + ({wd:.3f} × {after_tax_debt * 100:.2f}%) = {wacc_pct:.2f}%"
    ]

    return {
        "formula_name": "Weighted Average Cost of Capital (WACC)",
        "wacc_pct": round(wacc_pct, 2),
        "equity_weight_pct": round(we * 100, 1),
        "debt_weight_pct": round(wd * 100, 1),
        "after_tax_debt_cost_pct": round(after_tax_debt * 100, 2),
        "calculation_steps": steps,
        "strategic_recommendation": (
            f"The company's hurdle rate is {wacc_pct:.2f}%. Any new capital project or M&A acquisition must generate an internal return (IRR) exceeding this threshold to deliver economic profit."
        )
    }
