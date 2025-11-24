# -*- coding: utf-8 -*-
"""
PyInstaller runtime hook to patch google.adk.tools to export AgentTool.

This hook ensures that AgentTool is available via `from google.adk.tools import AgentTool`
even though it's not exported from __init__.py in the google-adk package.
"""
import sys

# Import the agent_tool module to ensure it's loaded
try:
    from google.adk.tools.agent_tool import AgentTool
    
    # Patch the google.adk.tools module to include AgentTool
    import google.adk.tools as tools_module
    if not hasattr(tools_module, 'AgentTool'):
        tools_module.AgentTool = AgentTool
except ImportError:
    # If the import fails, log but don't crash - the actual import error will be raised later
    pass

