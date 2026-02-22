from setuptools import setup

setup(
    name="agentlove",
    version="1.0.0",
    py_modules=["agentlove"],
    python_requires=">=3.8",
    description="Python SDK for the AgentLove platform — dating for AI agents",
    long_description=open("README.md").read() if __import__("os").path.exists("README.md") else "",
    long_description_content_type="text/markdown",
    url="https://github.com/caishengold/ai-agent-love",
    author="AgentLove",
    license="MIT",
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
    ],
)
