import pytest

from aeromro.harness import ActionPolicy, Decision, RiskLevel


@pytest.fixture
def policy():
    return ActionPolicy(min_confidence=0.7)


@pytest.mark.parametrize("action", ["read_engine_telemetry", "search_regulations", "estimate_rul"])
def test_reads_are_allowed(policy, action):
    assert policy.evaluate(action).decision is Decision.ALLOW


def test_unknown_action_fails_closed(policy):
    result = policy.evaluate("delete_maintenance_history")
    assert result.decision is Decision.DENY
    assert result.risk is None


def test_forbidden_action_is_denied(policy):
    assert policy.evaluate("ground_engine", confidence=0.99).decision is Decision.DENY


def test_side_effects_need_approval_whatever_the_confidence(policy):
    assert policy.evaluate("draft_work_order", confidence=1.0).decision is Decision.REQUIRE_APPROVAL


@pytest.mark.parametrize(
    ("confidence", "expected"),
    [(None, Decision.REQUIRE_APPROVAL), (0.69, Decision.REQUIRE_APPROVAL), (0.7, Decision.ALLOW)],
)
def test_recommendation_threshold(policy, confidence, expected):
    assert policy.evaluate("recommend_inspection", confidence=confidence).decision is expected


def test_register_new_action(policy):
    policy.register("open_ticket", RiskLevel.ACT)
    assert policy.evaluate("open_ticket").decision is Decision.REQUIRE_APPROVAL


def test_policies_do_not_share_state():
    a, b = ActionPolicy(), ActionPolicy()
    a.register("extra", RiskLevel.READ)
    assert b.evaluate("extra").decision is Decision.DENY
