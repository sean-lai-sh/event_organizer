from runtime.contracts import RiskLevel
from runtime.policy import (
    ActionClass,
    ApprovalPolicy,
    ToolAction,
    infer_tool_action_from_text,
)


def test_policy_requires_approval_for_send() -> None:
    policy = ApprovalPolicy()
    action = ToolAction(name="send_email", action_class=ActionClass.SEND)
    decision = policy.evaluate(action)

    assert decision.requires_approval
    assert decision.risk_level == RiskLevel.MEDIUM


def test_policy_allows_read_without_approval() -> None:
    policy = ApprovalPolicy()
    action = ToolAction(name="query", action_class=ActionClass.READ)
    decision = policy.evaluate(action)

    assert not decision.requires_approval
    assert decision.risk_level == RiskLevel.LOW


def test_infer_tool_action_detects_destructive() -> None:
    action = infer_tool_action_from_text("Delete the outreach row")
    assert action is not None
    assert action.action_class == ActionClass.DESTRUCTIVE


def test_infer_tool_action_detects_send() -> None:
    action = infer_tool_action_from_text("Send an email update")
    assert action is not None
    assert action.action_class == ActionClass.SEND
