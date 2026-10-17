# Stage 3 Passage Model Comparative Evaluation Report

## Executive Summary

To establish an archive-wide classification passage standard that is robust against conversational drift, branching DAG structures, and fine-grained analytical requirements, three candidate passage size models were stress-tested across five operational criteria:

1. **Model A: Atomic Exchange Unit** (1 User Prompt + 1 Assistant Response; 2 turns, ~200–800 tokens)
2. **Model B: Sliding Triad Window** (Target Exchange bounded by 1 contextBefore and 1 contextAfter exchange; 6 turns, ~1,200–3,500 tokens)
3. **Model C: Macro Sub-Session** (5 to 10 sequential exchanges along the branch; 10–20 turns, up to 8,000 tokens)

### Evaluation Matrix

| Evaluation Criterion | Model A (Atomic) | Model B (Sliding Triad) | Model C (Macro Sub-Session) |
|---|---|---|---|
| **1. Contextual Sufficiency** | 3 / 5 | **5 / 5** | 4 / 5 |
| **2. Topic Mixing Isolation (5 = Lowest Risk)** | **5 / 5** | 4 / 5 | 1 / 5 |
| **3. Citation Precision & Attribution Rigor** | **5 / 5** | **5 / 5** | 2 / 5 |
| **4. Branch & Boundary Stability** | **5 / 5** | 4 / 5 | 2 / 5 |
| **5. Labeling Feasibility Across Q1–Q5** | 3 / 5 | **5 / 5** | 2 / 5 |
| **Composite Score** | 21 / 25 | **23 / 25** | 11 / 25 |

---

## Methodological Trade-Off Analysis

### 1. Contextual Sufficiency vs. Topic Mixing Risk
- **Model A** isolates topics completely, but elliptic user turns (e.g., *"why?"*, *"continue"*, or isolated error trace snippets) become unclassifiable without antecedent knowledge.
- **Model C** provides extensive conversational history, but across 5–10 exchanges, user behavior exhibits natural topic pivots (e.g., moving from code architecture to marketing copy to personal reflection), contaminating the target with multiple conflicting subjects.
- **Model B** solves this tension by decoupling the **evaluative target** from the **interpretive context**. Preceding context (`contextBefore`) provides referential clarity and pronoun resolution, while the target remains cleanly bounded to a single operational exchange.

### 2. Citation Precision and Attribution Rigor (Q2, Q3, Q5)
- In **Model C**, citations span sprawling 10–20 turn transcripts, making character offsets and speaker node references diffuse. Attributing four-layer interpersonal dynamics (direct quote vs. user event report vs. user emotion vs. assistant interpretation) across 15 turns leads to severe epistemic confusion.
- In **Model B**, the target consists of exactly one user prompt node and one assistant response node (plus intermediate tool executions). Citations point directly to exact character spans within known mapping nodes, while `contextAfter` cleanly captures the succeeding user reaction for Q2 (corrections) and Q3 (assumption adoption).

### 3. Branch and Boundary Stability
- The ChatGPT export mapping graph contains tree bifurcations where users branched conversations. Model C generates significant duplicate sub-sequences and combinatorial bloat when spanning 5–10 exchanges across branch points.
- Models A and B follow deterministic root-to-leaf paths using inverted `parent` pointers, ensuring that alternative child branches remain strictly partitioned.

---

## Recommended Standard: Context-Bounded Sliding Triad Standard

For archive-wide classification, **Model B (Context-Bounded Sliding Triad Standard)** is adopted with the following operational specifications:

1. **Target Exchange Definition**: Commences with a user prompt node (`message.author.role == 'user'`), incorporates intermediate tool invocations, and terminates at the assistant response node (`message.author.role == 'assistant'`). All catalog labels and quotation offsets are restricted exclusively to this unit.
2. **Context Allocation Rules**:
   - `contextBefore`: Exactly 1 preceding exchange along the active branch ancestry path (`node.parent`), strictly providing antecedent constraints and pronoun resolution.
   - `contextAfter`: Exactly 1 succeeding exchange along the active branch path, strictly providing outcome validation and reaction tracking.
   - *Context turns must never supply semantic labels to the target passage.*
3. **Deterministic Deduplication**: Evidence aggregation and topic frequency accounting are keyed on `targetPassageId` (`conversation_id + '_' + target_user_node_id + '_' + target_assistant_node_id`). Context appearances carry zero independent evidentiary weight.
