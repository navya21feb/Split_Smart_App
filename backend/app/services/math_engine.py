from typing import List, Dict
from app.schemas import ParsedItem, PersonBreakdown


def calculate_deterministic_split(
    items: List[ParsedItem],
    members: List[str],
    tax: float,
    discount: float,
) -> tuple[List[PersonBreakdown], float]:
    """
    Deterministic Financial Engine:
    Never rely on an LLM for final currency arithmetic.
    Distributes item shares equally among assigned members,
    and allocates tax & discount strictly proportional to each member's subtotal.
    """
    member_subtotals: Dict[str, float] = {m: 0.0 for m in members}

    for item in items:
        assignees = [m for m in item.assigned_to if m in member_subtotals]
        if not assignees:
            assignees = members
        share = item.total_price / len(assignees)
        for person in assignees:
            member_subtotals[person] += share

    total_items_cost = sum(member_subtotals.values())
    breakdowns: List[PersonBreakdown] = []

    for member in members:
        sub = member_subtotals[member]
        ratio = (sub / total_items_cost) if total_items_cost > 0 else (1.0 / len(members))
        tax_share = tax * ratio
        discount_share = discount * ratio
        final_owed = max(0.0, sub + tax_share - discount_share)

        breakdowns.append(
            PersonBreakdown(
                member=member,
                items_subtotal=round(sub, 2),
                tax_share=round(tax_share, 2),
                discount_share=round(discount_share, 2),
                final_owed=round(final_owed, 2),
            )
        )

    grand_total = round(max(0.0, total_items_cost + tax - discount), 2)
    return breakdowns, grand_total
