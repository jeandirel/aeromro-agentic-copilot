from aeromro.__main__ import main


def test_cli_prints_policy(capsys):
    main()
    out = capsys.readouterr().out
    assert "aeromro-agentic-copilot" in out
    assert "ground_engine" in out and "deny" in out
    assert "draft_work_order" in out and "require_approval" in out
