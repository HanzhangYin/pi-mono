\section*{First Proof}

\section*{Mohammed Abouzaid* Stanford University}

Joe Kileel
University of Texas at Austin

\author{
Daniel Spielman \\ Yale University \\ Rachel Ward \({ }^{\ddagger}\) \\ University of Texas at Austin \\ Daniel Spielman
Yale University \\ Rachel Ward \({ }^{\ddagger}\) \\ ity of Texas at Austin
}

\author{
Andrew J. Blumberg \\ Columbia University
}

\author{
Tamara G. Kolda \\ MathSci.ai \\ Tamara G. Kol
MathSci.ai \\ Nikhil Srivastava \({ }^{\dagger}\) \\ University of California, Berkeley \\ Shmuel Weinberger \\ University of Chicago
}

\author{
Lauren Williams \({ }^{\text {§ }}\) \\ Harvard University
}

\author{
Martin Hairer \\ EPFL and Imperial
}

\author{
Paul D. Nelson \\ Aarhus University
}

March 17, 2026

\begin{abstract}
In this Arxiv preprint v2, we include an additional appendix with author-written solutions and comments for each of the ten questions, as posted to https://1stproof.org on February 13, 2026. Information about the next round of First Proof can be found on https://1stproof.org
\end{abstract}

\begin{abstract}
To assess the ability of current AI systems to correctly answer research-level mathematics questions, we share a set of ten math questions which have arisen naturally in the research process of the authors. The questions had not been shared publicly until now; the answers are known to the authors of the questions but will remain encrypted for a short time.
\end{abstract}

\footnotetext{
* ⊠ Corresponding author, Email: abouzaid @ stanford.edu
\({ }^{\dagger}\) △ Corresponding author, Email: nikhil@math.berkeley.edu
\({ }^{\ddagger}\) △ Corresponding author, Email: rward @ math.utexas.edu
\({ }^{\S} \boxtimes\) Corresponding author, Email: williams@math.harvard.edu
}

\section*{1 Introduction}

In baking, the first proof, or bulk fermentation process, is a crucial step in which one lets the entire batch of dough ferment as one mass, before dividing and shaping it into loaves.

This manuscript represents our preliminary efforts to come up with an objective and realistic methodology for assessing the capabilities of AI systems to autonomously solve research-level math questions. After letting these ideas ferment in the community, we hope to be able to produce a more structured benchmark in a few months.

One of our primary goals is to develop a sophisticated understanding of the role that AI tools could play in the workflow of professional mathematicians. While commercial AI systems are undoubtedly already at a level where they are useful tools for mathematicians it is not yet clear where AI systems stand at solving research-level math questions on their own, without an expert in the loop. At the moment, most math benchmarks assess the performance of AI systems on math contest questions, an artificial domain that does not reflect the practice of creative mathematics by researchers.

Evaluation of research capabilities is a challenging task. As frontier AI systems are now highly capable of searching the literature and translating mathematical questions from one format to another, it is challenging to disentangle problem-solving capabilities from search capabilities when conducting such an assessment. Our core observation is that an ideal test should involve research math questions which arose naturally in the process of a mathematician's own research, were subsequently solved by the mathematician, but have not yet been posted to the internet.

Towards this end, we present a diverse set of 10 research-level math questions, drawn from the mathematical fields of algebraic combinatorics, spectral graph theory, algebraic topology, stochastic analysis, symplectic geometry, representation theory, lattices in Lie groups, tensor analysis, and numerical linear algebra, each of which came about naturally in the research process for one of the authors (sometimes together with collaborators). Each question has been solved by the author(s) of the question with a proof that is roughly five pages or less, but the answers are not yet posted to the internet. The page restriction is due to the technical limitations of current publicly available AI systems, and this means that many of the questions on our list are not of sufficient importance to qualify as publishable research on their own, but are smaller components in future publications.

Most of the questions that we have collected are extracted from lemmas arising in larger works whose main results go beyond what current systems are capable of tackling. Significant effort is required to identify such lemmas as crucial steps in these works.

Before explaining the nature of our evaluation, we will try to be clear about what math research is. Contrary to the popular conception that research is only about finding solutions to well-specified, age-old problems (e.g., Fermat's Last Theorem), most of the important parts of modern research involve figuring out what the question actually is and developing frameworks within which it can be answered. Perelman's proof of the Poincaré conjecture was a stunning achievement. But in order for it to be possible, Thurston had to develop a new way of thinking about geometric objects and Hamilton had to invent a new kind of dynamics explaining how such objects change.

\footnotetext{
\({ }^{1}\) For instance, mathematicians are using AI tools to do literature searches, check manuscripts for errors, write computer code, and bounce ideas.
}

Our 'first proof' experiment is focused on the final and most well-specified stage of math research, in which the question and frameworks are already understood. We do not address the selection of questions to study, the formulation of new definitions, and the development of novel theories. We wish to be clear that our choice of emphasis on proving well-formed statements is driven by the judgment that this is a first step; evaluation of the performance of frontier systems on the higher-level research tasks above is also essential.

The answers to our set of ten research level math questions have been encrypted and posted to https://1stproof.org. The authors will release the answers on February 13, 2026. We invite the community to experiment with our ten questions before the answers are released, and to share their results and observations online. Ideally, participants should share a complete transcript of their interaction with an AI system. In this process, we hope to gain insight into questions such as: What is an appropriate prompting strategy? What format should an answer take and how should it be graded? Are there data contamination issues we have missed? We hope to use this understanding to design a more formal benchmark. A few months later, we plan to finalize a second set of questions; we are open to devising agreements to test AI models on these questions prior to making them public.

Unlike other proposed math research benchmarks (see Section 3), our question list should not be considered a benchmark in its current form. For one, our questions are not numerous enough to be considered a benchmark. By construction, producing research-level math questions with answers which have not yet been published, and whose answers are a certain length, requires substantial human effort. A typical mathematician might create and address a few such questions a year. Additionally, we have not specified a formal grading scheme for answers. While we have found correct answers to each of the questions, correct answers are not always unique - there may be multiple proofs or, alternatively, multiple counterexamples. This makes assessment more challenging, as it must at present be done by a human expert.

Compared to previous assessments of AI systems in completing tasks related to mathematical research (discussed in Section 3below), to the best of our knowledge, ours is the first to simultaneously have all of the following features:
- The questions are sampled from the true distribution of questions that mathematicians are currently working on. Their answers are proofs, which at present must be graded by humans.
- The answers have never appeared on the internet, in talks, or in any public forum. This eliminates a substantial data contamination problem.
- The questions are being made public in this document. This means they cannot be reused in the future, but they can be examined by everyone.
- We allow models unfettered access to outside resources such as Internet searches, bringing them closer to representing real-world assessments.

We ran preliminary tests on many of our ten questions using GPT 5.2 Pro and Gemini 3.0 Deepthink; we briefly discuss our mitigation strategy for data contamination in Section 4 . Our tests indicate that - when the system is given one shot to produce the answer - the best publicly available AI systems struggle to answer many of our questions. In the interest of following a clear protocol, we chose not to iteratively interact with the systems, or even re-run the queries. However, we expect that through such interactions we would be able to coax the systems to produce better
answers.
Conflicts of interest. No funding was received for the design or implementation of this project. None of the authors of this report was employed by or consulted with AI companies during the project, nor will they do so while contributing to it.

Acknowledgment. We thank the Simons Institute for the Theory of Computing for hosting the organizational meeting of this project in early December 2025, with support from the Director's Opportunity Fund. PN is supported by a research grant (VIL 54509 ) from VILLUM FONDEN. This statement reflects author support and does not imply sponsor involvement in the benchmark.

\section*{2 The questions}
1. Let \(\mathbb{T}^{3}\) be the three dimensional unit size torus and let \(\mu\) be the \(\Phi_{3}^{4}\) measure on the space of distributions \(\mathcal{D}^{\prime}\left(\mathbb{T}^{3}\right)\). Let \(\psi: \mathbb{T}^{3} \rightarrow \mathbb{R}\) be a smooth function that is not identically zero and let \(T_{\psi}: \mathcal{D}^{\prime}\left(\mathbb{T}^{3}\right) \rightarrow \mathcal{D}^{\prime}\left(\mathbb{T}^{3}\right)\) be the shift map given by \(T_{\psi}(u)=u+\psi\) (with the usual identification of smooth functions as distributions). Are the measures \(\mu\) and \(T_{\psi}^{*} \mu\) equivalent? Here, equivalence of measures is in the sense of having the same null sets and \(T_{\psi}^{*}\) denotes the pushforward under \(T_{\psi}\).
2. Let \(F\) be a non-archimedean local field with ring of integers \(\mathfrak{o}\). Let \(N_{r}\) denote the subgroup of \(\mathrm{GL}_{r}(F)\) consisting of upper-triangular unipotent elements. Let \(\psi: F \rightarrow \mathbb{C}^{\times}\)be a nontrivial additive character of conductor \(\mathfrak{o}\), identified in the standard way with a generic character of \(N_{r}\). Let \(\Pi\) be a generic irreducible admissible representation of \(\mathrm{GL}_{n+1}(F)\), realized in its \(\psi^{-1}\)-Whittaker model \(\mathcal{W}\left(\Pi, \psi^{-1}\right)\). Must there exist \(W \in \mathcal{W}\left(\Pi, \psi^{-1}\right)\) with the following property?
Let \(\pi\) be a generic irreducible admissible representation of \(\mathrm{GL}_{n}(F)\), realized in its \(\psi\)-Whittaker model \(\mathcal{W}(\pi, \psi)\). Let \(\mathfrak{q}\) denote the conductor ideal of \(\pi\), let \(Q \in F^{\times}\)be a generator \(\mathfrak{q}^{-1}\), and set
\[
u_{Q}:=I_{n+1}+Q E_{n, n+1} \in \mathrm{GL}_{n+1}(F)
\]
where \(E_{i, j}\) is the matrix with a 1 in the \((i, j)\)-entry and 0 elsewhere. For some \(V \in \mathcal{W}(\pi, \psi)\), the local Rankin-Selberg integral
\[
\int_{N_{n} \backslash \mathrm{GL}_{n}(F)} W\left(\operatorname{diag}(g, 1) u_{Q}\right) V(g)|\operatorname{det} g|^{s-\frac{1}{2}} d g
\]
is finite and nonzero for all \(s \in \mathbb{C}\).
3. Let \(\lambda=\left(\lambda_{1}>\cdots>\lambda_{n} \geq 0\right)\) be a partition with distinct parts. Assume moreover that \(\lambda\) is restricted, in the sense that it has a unique part of size 0 and no part of size 1 . Does there exist a nontrivial Markov chain on \(S_{n}(\lambda)\) whose stationary distribution is given by
\[
\frac{F_{\mu}^{*}\left(x_{1}, \ldots, x_{n} ; q=1, t\right)}{P_{\lambda}^{*}\left(x_{1}, \ldots, x_{n} ; q=1, t\right)} \text { for } \mu \in S_{n}(\lambda)
\]
where \(F_{\mu}^{*}\left(x_{1}, \ldots, x_{n} ; q, t\right)\) and \(P_{\lambda}^{*}\left(x_{1}, \ldots, x_{n} ; q, t\right)\) are the interpolation ASEP polynomial and interpolation Macdonald polynomial, respectively? If so, prove that the Markov chain you construct has the desired stationary distribution. By "nontrivial" we mean that the transition probabilities of the Markov chain should not be described using the polynomials \(F_{\mu}^{*}\left(x_{1}, \ldots, x_{n} ; q, t\right)\).
4. Let \(p(x)\) and \(q(x)\) be two monic polynomials of degree \(n\) :
\[
p(x)=\sum_{k=0}^{n} a_{k} x^{n-k} \quad \text { and } \quad q(x)=\sum_{k=0}^{n} b_{k} x^{n-k}
\]
where \(a_{0}=b_{0}=1\). Define \(p \boxplus_{n} q(x)\) to be the polynomial
\[
\left(p \boxplus_{n} q\right)(x)=\sum_{k=0}^{n} c_{k} x^{n-k}
\]
where the coefficients \(c_{k}\) are given by the formula:
\[
c_{k}=\sum_{i+j=k} \frac{(n-i)!(n-j)!}{n!(n-k)!} a_{i} b_{j}
\]
for \(k=0,1, \ldots, n\). For a monic polynomial \(p(x)=\prod_{i \leq n}\left(x-\lambda_{i}\right)\), define
\[
\Phi_{n}(p):=\sum_{i \leq n}\left(\sum_{j \neq i} \frac{1}{\lambda_{i}-\lambda_{j}}\right)^{2}
\]
and \(\Phi_{n}(p):=\infty\) if \(p\) has a multiple root. Is it true that if \(p(x)\) and \(q(x)\) are monic real-rooted polynomials of degree \(n\), then
\[
\frac{1}{\Phi_{n}\left(p \boxplus_{n} q\right)} \geq \frac{1}{\Phi_{n}(p)}+\frac{1}{\Phi_{n}(q)} ?
\]
5. Fix a finite group \(G\). Let \(\mathscr{O}\) denote an incomplete transfer system associated to an \(N_{\infty}\) operad. Define the slice filtration on the \(G\)-equivariant stable category adapted to \(\mathscr{O}\) and state and prove a characterization of the \(\mathscr{O}\)-slice connectivity of a connective \(G\)-spectrum in terms of the geometric fixed points.
6. For a graph \(G=(V, E)\), let \(G_{S}=(V, E(S, S))\) denote the graph with the same vertex set, but only the edges between vertices in \(S\). Let \(L\) be the Laplacian matrix of \(G\) and let \(L_{S}\) be the Laplacian of \(G_{S}\). I say that a set of vertices \(S\) is \(\epsilon\)-light if the matrix \(\epsilon L-L_{S}\) is positive semidefinite. Does there exist a constant \(c>0\) so that for every graph \(G\) and every \(\epsilon\) between 0 and \(1, V\) contains an \(\epsilon\)-light subset \(S\) of size at least \(c \epsilon|V|\) ?
7. Suppose that \(\Gamma\) is a uniform lattice in a real semi-simple group, and that \(\Gamma\) contains some 2-torsion. Is it possible for \(\Gamma\) to be the fundamental group of a compact manifold without boundary whose universal cover is acyclic over the rational numbers \(\mathbb{Q}\) ?
8. A polyhedral Lagrangian surface \(K\) in \(\mathbb{R}^{4}\) is a finite polyhedral complex all of whose faces are Lagrangians, and which is a topological submanifold of \(\mathbb{R}^{4}\). A Lagrangian smoothing of \(K\) is a Hamiltonian isotopy \(K_{t}\) of smooth Lagrangian submanifolds, parameterised by \((0,1]\), extending to a topological isotopy, parametrised by \([0,1]\), with endpoint \(K_{0}=K\).
Let \(K\) be a polyhedral Lagrangian surface with the property that exactly 4 faces meet at every vertex. Does \(K\) necessarily have a Lagrangian smoothing?
9. Let \(n \geq 5\). Let \(A^{(1)}, \ldots, A^{(n)} \in \mathbb{R}^{3 \times 4}\) be Zariski-generic. For \(\alpha, \beta, \gamma, \delta \in[n]\), construct \(Q^{(\alpha \beta \gamma \delta)} \in \mathbb{R}^{3 \times 3 \times 3 \times 3}\) so that its \((i, j, k, \ell)\) entry for \(1 \leq i, j, k, \ell \leq 3\) is given by \(Q_{i j k \ell}^{(\alpha \beta \gamma \delta)}= \operatorname{det}\left[A^{(\alpha)}(i,:) ; A^{(\beta)}(j,:) ; A^{(\gamma)}(k,:) ; A^{(\delta)}(\ell,:)\right]\). Here \(A(i,:)\) denotes the \(i\) th row of a matrix \(A\), and semicolon denotes vertical concatenation. We are interested in algebraic relations on the set of tensors \(\left\{Q^{(\alpha \beta \gamma \delta)}: \alpha, \beta, \gamma, \delta \in[n]\right\}\).
More precisely, does there exist a polynomial \(\operatorname{map} \mathbf{F}: \mathbb{R}^{81 n^{4}} \rightarrow \mathbb{R}^{N}\) that satisfies the following three properties?
- The map \(\mathbf{F}\) does not depend on \(A^{(1)}, \ldots A^{(n)}\).
- The degrees of the coordinate functions of \(\mathbf{F}\) do not depend on \(n\).
- Let \(\lambda \in \mathbb{R}^{n \times n \times n \times n}\) satisfy \(\lambda_{\alpha \beta \gamma \delta} \neq 0\) for precisely \(\alpha, \beta, \gamma, \delta \in[n]\) that are not identical. Then \(\mathbf{F}\left(\lambda_{\alpha \beta \gamma \delta} Q^{(\alpha \beta \gamma \delta)}: \alpha, \beta, \gamma, \delta \in[n]\right)=0\) holds if and only if there exist \(u, v, w, x \in\left(\mathbb{R}^{*}\right)^{n}\) such that \(\lambda_{\alpha \beta \gamma \delta}=u_{\alpha} v_{\beta} w_{\gamma} x_{\delta}\) for all \(\alpha, \beta, \gamma, \delta \in[n]\) that are not identical.
10. Given a \(d\)-way tensor \(\mathcal{T} \in \mathbb{R}^{n_{1} \times n_{2} \times \cdots \times n_{d}}\) such that the data is unaligned (meaning the tensor \(\mathcal{T}\) has missing entries), we consider the problem of computing a CP decomposition of rank \(r\) where some modes are infinite-dimensional and constrained to be in a Reproducing Kernel Hilbert Space (RKHS). We want to solve this using an alternating optimization approach, and our question is focused on the mode- \(k\) subproblem for an infinite-dimensional mode. For the subproblem, then CP factor matrices \(A_{1}, \ldots, A_{k-1}, A_{k+1}, \ldots, A_{d}\) are fixed, and we are solving for \(A_{k}\).

Our notation is as follows. Let \(N=\prod_{i} n_{i}\) denote the product of all sizes. Let \(n \equiv n_{k}\) be the size of mode \(k\), let \(M=\prod_{i \neq k} n_{i}\) be the product of all dimensions except \(k\), and assume \(n \ll M\). Since the data are unaligned, this means only a subset of \(\mathcal{T}\) 's entries are observed, and we let \(q \ll N\) denote the number of observed entries. We let \(T \in \mathbb{R}^{n \times M}\) denote the mode- \(k\) unfolding of the tensor \(\mathcal{T}\) with all missing entries set to zero. The vec operations creates a vector from a matrix by stacking its columns, and we let \(S \in \mathbb{R}^{N \times q}\) denote the selection matrix (a subset of the \(N \times N\) identity matrix) such that \(S^{T} \operatorname{vec}(T)\) selects the \(q\) known entries of the tensor \(\mathcal{T}\) from the vectorization of its mode- \(k\) unfolding. We let \(Z=A_{d} \odot \cdots \odot A_{k+1} \odot A_{k-1} \odot \cdots \odot A_{1} \in \mathbb{R}^{M \times r}\) be the Khatri-Rao product of the factor matrices corresponding to all modes except mode \(k\). We let \(B=T Z\) denote the MTTKRP of the tensor \(\mathcal{T}\) and Khatri-Rao product \(Z\).

We assume \(A_{k}=K W\) where \(K \in \mathbb{R}^{n \times n}\) denotes the psd RKHS kernel matrix for mode \(k\). The matrix \(W\) of size \(n \times r\) is the unknown for which we must solve. The system to be solved is
\[
\left[(Z \otimes K)^{T} S S^{T}(Z \otimes K)+\lambda\left(I_{r} \otimes K\right)\right] \operatorname{vec}(W)=\left(I_{r} \otimes K\right) \operatorname{vec}(B)
\]

Here, \(I_{r}\) denotes the \(r \times r\) identity matrix. This is a system of size \(n r \times n r\) Using a standard linear solver costs \(O\left(n^{3} r^{3}\right)\), and explicitly forming the matrix is an additional expense.

Explain how an iterative preconditioned conjugate gradient linear solver can be used to solve this problem more efficiently. Explain the method and choice of preconditioner. Explain in detail how the matrix-vector products are computed and why this works. Provide complexity analysis. We assume \(n, r<q \ll N\). Avoid any computation of order \(N\).

\section*{3 Related work}

As mentioned earlier, there have been several proposed math research benchmarks. We discuss a few of them here.

FrontierMath [1] is a benchmark of "several hundred unpublished, expert-level mathematics problems that take specialists hours to days to solve." It was funded by OpenAI. Presently, the FrontierMath problems are private (apart from 12 examples that are publicly available). OpenAI has access to a subset of FrontierMath problems and solutions, and EpochAI has access to the full set of solutions. The FrontierMath problems are structured so that each final answer is an integer or symbolic expression, which makes them automatically gradable, as well as amenable to post-training via reinforcement learning.

IMProofBench [2] is a broader mathematical proof benchmark, designed to evaluate the ability of AI systems to create research-level mathematical proofs. The problems are designed to allow for automatic grading of subquestions, but still require human experts to fully verify correctness. The IMProofBench questions are private.

The RealMath benchmark for research-level math questions [3] scrapes (i.e. collects papers automatically from) math and computer science categories in arXiv.org, skewing toward fields with "constructive" theorems like probability and statistics. It only scrapes questions posted after the "training data cutoff" of the AI models being tested, where training data cutoff refers to the final date from which web data was collected and used for training data. Like FrontierMath, the RealMath questions are designed to facilitate automatic grading, with a final short symbolic or numeric answer. Unlike FrontierMath and IMProofBench, the RealMath questions are public and intended to be refreshed every so often to avoid data contamination.

\section*{4 Implementation details}

Over the span of a few weeks, we tested roughly 20 research-level math questions using Gemini 3 Pro, GPT-5.1 Pro, and then GPT-5.2 Pro when GPT 5.2 Pro became available. The final selection of questions used the following criteria:
1. Use of the AI system did not reveal the existence of a previous answer to the question that was unknown to the authors.
2. A one page statement was sufficient for the systems to "understand" the formulation of the question, i.e. it was able to reformulate the question in its own language before starting to answer it.
3. Agreement was reached with the authors of the question to release a human generated proof within the required parameters (length and timeframe).
4. No member of the team contributed more than one problem.

The reason for testing more than 10 questions was to probe the "boundary" between the types of questions the models can solve and the types of questions beyond their reach. To minimize data contamination, we turned off the option to share data for training and improving models, but we are aware that data is still retained for 3 days by Google, and 30 days by OpenAl \({ }^{2}\). Throughout the process, we have endeavored to keep the answers to our questions private. We have uploaded encrypted answers to the private repository, https://1stproof.org. We will make the answers publicly available about a week after we release the questions.

\section*{5 Discussion}

We have presented a set of ten research-level mathematics questions. As mentioned earlier, mathematical research consists of multiple components, including:
- creating and selecting the questions to study, which will guide and shape the field;
- developing novel theories for approaching these questions, including formalizing new definitions and frameworks;
- finding answers to the selected questions, and rigorously proving that these answers are correct.

Our 'first proof' experiment is focused on the final, most well-specified, and most measurable stage of mathematical research, that is, finding answers to the selected questions. We do not address the question of evaluating whether AI systems can reasonably create questions to study, or develop novel theories.

We plan to create a second set of questions of the same nature as the ones in Section 2 in the coming months, and we are open to devising agreements to test frontier AI systems on the second set of questions before we release them. We hope that this second set of questions can serve as a form of benchmark for testing the capabilities of AI.

Beyond the next release, depending on technological developments, we plan to release additional sets of questions by removing some of the artificial constraints we imposed on our chosen questions, such as length, as well as to explore ways of measuring performance along other aspects of the work of research mathematics.

\footnotetext{
\({ }^{2}\) According to our reading of the OpenAI Terms of Service, a chat can be retained longer than 30 days if the chat has been de-identified and disassociated from the author. According to our reading of the Gemini Terms of Service, chats reviewed by human reviewers may be retained for up to 3 years.
}

\section*{References}
[1] Epoch AI. FrontierMath. https://epoch.ai/frontiermath.
[2] J. Schmitt, G. Bérczi, J. Dekoninck, J. Feusi, T. Gehrunger, R. Appenzeller, J. Bryan, N. Canova, T. de Wolff, F. Gaia, et al. IMProofBench: Benchmarking AI on research-level mathematical proof generation. Preprint, arXiv:2509.26076, 2025.
[3] J. Zhang, C. Petrui, K. Nikolić, and F. Tramèr. RealMath: A continuous benchmark for evaluating language models on research-level mathematics. Preprint, arXiv:2505.12575, 2025.

\section*{A First Proof Solutions and comments}

On February 4 and 5, 2026, we tested the questions on Gemini 3.o Deep Think and ChatGPT 5.2 Pro with the following prompts.

Prompt 1. The following is a research-level math question. The question has an answer, but it might not appear on the internet. Please make a best effort to provide a rigorous and complete answer to the question. Write the output as a compilable LaTeX document using the standards of rigor and scholarship that prevail in the mathematical literature.

Prompt 2 (Internet Discouraged). The following is a research-level math question. The question has an answer. Please make a best effort to provide a rigorous and complete answer to the question. Write the output as a compilable LaTeX document using the standards of rigor and scholarship that prevail in the mathematical literature. Do not use web search, but instead try to reason through the answer.

In the following subsections, we comment briefly on the best LLM solutions that we obtained in these internal tests.

\section*{A. 1 Question 1: Martin Hairer}

In this case, a note with a very short sketch of proof (far short of the level of detail one would expect for a published article) was posted on the author's homepage some time ago. The answer given by GPT-Pro simply quotes that note, claiming that it contains a detailed proof of the result. This is incorrect and it is despite the LLM being specifically instructed to comply with "mathematics publication" levels of scholarship. (Taking for granted a result that is merely stated in an unpublished note with a very rough sketch of proof is not considered acceptable in the mathematics literature.)

Another behaviour we observed was that the LLM would take as a premise the (wrong!) statement that the \(\Phi_{3}^{4}\) measure is equivalent to the free field measure, from which it then correctly deduces the (incorrect) claim that the \(\Phi_{3}^{4}\) measure is quasi-invariant under smooth shifts.

\section*{A. 2 Question 2: Paul Nelson}

In some attempts, the LLM constructed \(W\) depending on \(\pi\), but the problem asks for a single \(W\) that works for all \(\pi\). This is a critical condition; without it, the problem is much easier and the solution is well-known. In some (but not all) cases, the LLM noted that it had solved a weaker problem.

In the best attempt in our trial runs, ChatGPT 5.2 Pro identified a suitable choice of \(W\) and reduced (as in our solution) to exhibiting \(V\) for which the integral \(\int_{\mathrm{GL}_{n}(\mathfrak{o})} V(g) \psi\left(-Q g_{n n}\right) d g\) does not vanish. This nonvanishing is the key point.

ChatGPT then attempted to choose \(V\) so that the integrand is constant on its support, which, if possible, would make the nonvanishing clear. This strategy is unviable. For instance, when \(n=1\), \(V\) must be (a nonzero multiple of) a character of \(F^{\times}\)and the integral is a normalized Gauss sum; in particular, the integrand is typically non-constant. For larger \(n\), the unviability follows similarly by considering the action of the center.

To identify the specific error in the attempted solution, we look for the first place asserting stronger support properties of \(V\) than are generally true. The culprit is the support condition claimed in the "standard Howe-vector existence result," which never holds: it contradicts the fact that \(V\) has a central character.

\section*{A. 3 Question 3: Lauren Williams}

The best solution that LLM's produced for Question 3 in our internal experiments was to use the Metropolis-Hastings algorithm to produce a Markov chain whose stationary distribution had the desired formula. However, by design, the Metropolis-Hastings algorithm uses the desired formula to define its transition rates. This algorithm can be used to cook up a Markov chain with any desired distribution. Hence this is considered a "trivial" solution to the problem (which specifically asked that the transition probabilities not be described in terms of the interpolation polynomials). Sometimes the LLM's would give a slight variant of the above trivial solution where they would replace the interpolation polynomials by an equivalent formula for them (the signed multiline queue formula of Ben Dali-Williams).

Another common response given by LLM's was to change the problem to a related but different, and already-solved problem, namely, to replace interpolation ASEP and interpolation Macdonald polynomials by ASEP and Macdonald polynomials. In this case the solution to this problem is the \(t\)-Push TASEP and was given in a paper by Ayyer, Martin, and Williams.

\section*{A. 4 Question 4: Nikhil Srivastava}

The only attempt at the general \(n \geq 4\) case of this question was made by ChatGPT Pro 5.2 with the no internet prompt. After collecting some standard facts in the first three pages, its plan was to execute Blachman's approach to the classical Stam inequality (Section 4). In this approach the key step is to identify the score function of a sum of independent random variables \(X+Y\) as a conditional expectation of the score function of \(X\) conditioned on \(X+Y\), in the appropriate joint probability space, after which the inequality reduces to Cauchy-Schwartz. The main difficulty is finding an analogue of this joint probability space in the finite free setting.

The LLM attempted to find a probability space in which a score function could live by considering the random matrix model for the finite free convolution \(r(x)=p \boxplus_{n} q(x)=\mathbb{E} \operatorname{det}\left(x I-A-U B U^{T}\right)\). It gathered some facts about \(r(x)\) for large real \(x\) away from the roots, asserted wrongly that \(\Phi_{n}(r)\) can be read off from residues of \(\left(r^{\prime}(x) / r(x)\right)^{\prime}\) at the roots of \(r(x)\), and then asserted that the proof can be finished via the residue calculus without giving details. This sequence of steps did not make sense to me.

At a conceptual level, this proof strategy cannot succeed because only the score function of \(r(x)\) is considered, and the score functions of \(p(x), q(x)\) are never mentioned. It also does not exploit the fact that \(\boxplus_{n}\) preserves real roots, which must be used since the inequality is not true for arbitrary polynomials.

\section*{A. 5 Question 5: Andrew J. Blumberg}

The best solutions by Gemini and ChatGPT 5.2 Pro contained an essentially correct statement of the definition of the \(\mathcal{O}\)-slice filtration and the connectivity characterization. The proofs offered, like the proof from the work with Michael A. Hill and Tyler Lawson which generated this question, closely follow the basic outline of a previous paper by Hill-Yarnall. However, in each case, some of the details were either sketched or slightly garbled. For example, the ChatGPT solution claims to be working in the \(\mathcal{O}\)-stable category, but is breezy about what is required (and subsequent statements it makes are then missing hypotheses). Section 4 introduces and uses the notion of "geometric objects" from Hill-Yarnall without defining them. The Gemini solution outline an argument for sufficiency of the condition which is more of a sketch than an argument.

A number of LLM runs produced serious hallucinations, citing lemmas that did not exist from Hill-Hopkins-Ravenel or in one case confabulating an entire paper and attributing the result to this putative source. Some also contained seriously false statements, for example about the spectra to which the tom Dieck splitting applies.

\section*{A. 6 Question 6: Daniel Spielman}

Gemini asserted that it presented a proof of the existence of a constant that satisfied Question 6. But, after some correct statements, it presented a very vague explanation of how the proof could be finished. To me, it seems unlikely that the approach can be turned into a correct proof.

ChatGPT 5.2 Pro asserted that it could not answer the question. So, it instead offered a correct upper bound of \(1 / 2\) on the constant, if it exists.

\section*{A. 7 Question 7: Shmuel Weinberger}

In the no internet version, Theorem 4 and in the internet version it is Lemma 5, are false (they are the same statement). The counterexample is \(\mathbb{R}^{1}\) and \(f\) is a translation. It has no fixed points, but its Lefschetz number in their sense is -1 .

The AI proofs only use finite complex and Poincaré duality. However, Fowler's paper shows that if \(\Gamma\) is a lattice in a linear semisimple group \(G\), then taking a homomorphism from \(\Gamma\) to a finite group \(\Delta\), with kernel \(\Gamma_{0}\) torsion free, the product \(M^{3} \times\left(K \backslash G / \Gamma_{0} \times E \Delta\right) / \Delta\), where \(E \Delta\) is a contractible
space with free \(\Delta\) action, and \(M^{3}\) is any closed hyperbolic 3 -manifold, has the rational type of a finite complex, and satisfies Rational Poincaré duality. It has fundamental group \(\pi_{1}\left(M^{3}\right) \times \Gamma\) which is a lattice in \(\operatorname{SO}(3,1) \times G\). This shows that all such proofs must fail.

Some proofs try to use "multiplicativity of Euler characteristic in finite covers". This is false for infinite complexes with finitely generated homology over \(\mathbb{Q}\). The simplest example I know is the following: Consider the universal cover of \(\mathbb{R} P^{2}\) wedge an infinite number of \(S^{2}\) 's. It has an involution, and \(\pi_{2}\) is \(\mathbb{Z}[-1]+\mathbb{Z}[\mathbb{Z} / 2]^{\infty}\). ( \(\mathbb{Z}[-1]\) is \(\mathbb{Z}\) acted on by the involution by multiplication by -1 .) This module is, after tensoring with \(\mathbb{Z}[1 / 2]\) a free \(\mathbb{Z}[1 / 2][\mathbb{Z} / 2]\) module, so one can use a free basis to equivariantly attach \(D^{3} \times \mathbb{Z} / 2\) 's to kill the homology (=homotopy). The new space will be rationally acyclic, and both it and its quotient under \(\mathbb{Z} / 2\) will be, and will have rational Euler characteristic \(=1\).

\section*{A. 8 Question 8: Mohammed Abouzaid}

The best two solutions produced during testing both correctly identified the existence of a local smoothing near every vertex; the proof uses essentially the same basic linear algebra argument that appears in the human solution. The proof then proceeds to perform a local-to-global gluing argument. It was a priori clear that there must be a gap in this argument because the LLM solution refers to the existence of a linear symplectic transformation that brings a neighbourhood of each vertex and each edge into a standard position, but fails to discuss the compatibility between these choices. In the case of the solution produced by the model which was not discouraged to use the internet, the error was finally identified, after a careful reading, in Step 3 of the Proof of Theorem 1: the LLM system asserted that one can choose disjoint neighbourhoods of the edges and of the vertices. In the other case, the error is in Step 2: the model performs a local move near vertices, which changes the local geometry near the edges, invalidating the application of the edge move.

The errors in these solutions can be repaired at the cost of significant computations of changes of coordinates, which would become extremely burdensome in any generalisation. The point of the solution we provide is to obtain a proof which avoids (most of) the hard work, and which experts can readily generalise to other symplectic manifolds (in any dimension).

\section*{A. 9 Question 9: Joe Kileel}

The best LLM answer found during testing was NoInternet-040226. This is an essentially correct answer. It constructs the same algebraic relations as in my own answer, namely the various \(5 \times 5\) minors of the four \(3 n \times 27 n^{3}\) flattenings of the block tensor assembling together the \(Q^{(\alpha \beta \gamma \delta)}\). The proof by the LLM that the algebraic relations satisfy the desired properties differs from my own argument. The LLM considers a torus action on an appropriate Grassmannian, argues the stabilizer of a generic point is 1-dimensional, and uses this to show separability of \(\lambda\) in a somewhat fidgety way. By contrast, I directly constrain \(\lambda\) by considering certain selected algebraic relations. Some other LLM answers produced during testing were incorrect, and claimed that no algebraic relations exist that satisfy the desired properties. Those answers seemed to get confused about the question setup midway through. My question is closely related to a work I published with Miao and Lerman in 2024 (https://proceedings.neurips.cc/paper_files/paper/2024/
hash/80cddcdd52c84d19b8b4a27a8e8c17d8-Abstract-Conference.html). Indeed, it is a fourth-order variant of Theorem 2 in that paper which concerns the third-order case. Therefore, if LLMs locate and understand that paper they would have a warm-start for this question.

\section*{A. 10 Question 10: Tammy Kolda}

The best LLM solution was correct and better than the solution I provided in that it lowered the computational complexity. Most importantly, it had an insight that was obvious in hindsight but that I had not seen yet myself. Since LLMs are well known to surface existing solutions, I tried search on "subsampled kronecker product matvec" and found that the main idea in the solution exists in https://arxiv.org/pdf/1601.01507. (I am not sure if this is the only source of the solution, but it is at least one such solution.)

The LLM solution did not meet the standards of including appropriate citations, but it was otherwise a good solution. The solution I had provided included a transformation of the problem that the LLM did not do, but the problem was open-ended and this was not necessary. I am planning to borrow aspects of the LLM solution, although I hope to do a better job at attribution of the ideas.

\section*{B The human-generated solutions to our problems}

Our solutions appear below. They are identical to the solutions which were encrypted on February 5, 2026, and released on February 13, 2026.

\section*{B. 1 Question 1: Martin Hairer.}

Authors: Martin Hairer and Jacopo Peroni
Title: (Lack of) quasi-shift invariance of the \(\Phi_{3}^{4}\) measure
This is a simplified version of a result that will appear as part of [1]. The proof relies strongly on the ideas from [2].

Let \(\mathbb{T}^{3}\) be the three dimensional unit size torus and let \(\mu\) be the \(\Phi_{3}^{4}\) measure on the space of distributions \(\mathcal{D}^{\prime}\left(\mathbb{T}^{3}\right)\). Let \(\psi: \mathbb{T}^{3} \rightarrow \mathbb{R}\) be a smooth function that is not identically zero and let \(T_{\psi}: \mathcal{D}^{\prime}\left(\mathbb{T}^{3}\right) \rightarrow \mathcal{D}^{\prime}\left(\mathbb{T}^{3}\right)\) be the shift map given by \(T_{\psi}(u)=u+\psi\) (with the usual identification of smooth functions as distributions). Is the statement "the measures \(\mu\) and \(T_{\psi}^{*} \mu\) are equivalent" true? Here, equivalence of measures is in the sense of having the same null sets and \(T_{\psi}^{*}\) denotes the pushforward under \(T_{\psi}\).

Some Context One of the very few interacting quantum field theories that can be rigorously constructed is the so-called (bosonic) \(\Phi^{4}\) theory in (space-time) dimensions 2 and 3 . It has long been known that in dimension 2 and finite volume there is a natural identification between the Hilbert space of the interacting theory and that of the corresponding free theory. On the other hand, Glimm [3] observed that this is no longer the case in dimension 3. At the level of the corresponding Euclidean theories (which are represented by probability measures on the space of

Schwartz distributions on the corresponding space-time), this translates into the fact that the \(\Phi^{4}\) measure \(\mu\) and the corresponding free field measure \(\nu\) are equivalent in dimension 2 but mutually singular in dimension 3. In fact, there is a sense in which the dimension that delimits between the two behaviors is \(8 / 3\). It is then natural to ask in which dimensions \(\mu\) has the weaker property that \(\mu\) and \(T_{\psi}^{*} \mu\) are equivalent for smooth \(\psi\). Here it turns out that the borderline dimension is 3 , and the question probes on which side it falls.

An incomplete heuristic Regarding the proof, a tempting heuristic is to use the fact that one should think of \(\mu\) as having the density with respect to "Lebesgue measure on \(\mathcal{D}^{\prime}\) " (which of course doesn't exist) proportional to
\[
\exp \left(-\int_{\mathbb{T}^{3}}\left(\frac{1}{2}|\nabla \Phi(x)|^{2}+\frac{1}{4}|\Phi(x)|^{4}-\frac{C}{2}|\Phi(x)|^{2}\right) d x\right)
\]
where \(C\) is a (diverging) constant of the form \(C=3 c_{1}-9 c_{2}\), where \(c_{1}\) is the expectation of \(|\Phi(x)|^{2}\) under the free field measure \(\nu\) (which is of course infinite) and \(c_{2}\) is an additional logarithmically divergent constant. The density of \(T_{\psi}^{*} \mu\) with respect to \(\mu\) is then formally given by
\[
\begin{aligned}
\exp \left(-\int_{\mathbb{T}^{3}}\right. & \left(\frac{1}{2}|\nabla \psi(x)|^{2}+\frac{1}{4}|\psi(x)|^{4}+\Phi(x) \Delta \psi(x)-\Phi(x) \psi^{3}(x)\right. \\
& \left.\left.-\psi(x)\left(\Phi^{3}(x)-C \Phi(x)\right)+\frac{\psi^{2}(x)}{2}\left(3 \Phi^{2}(x)-C\right)\right) d x\right)
\end{aligned}
\]

Since the terms on the first line are well-defined for smooth \(\psi\) and one expects \(\Phi^{3}-C \Phi\) and \(\Phi^{2}-c_{1}\) to be quite well-behaved, the additional logarithmically divergent term proportional to \(c_{2}\) causes this "density" to diverge, suggesting (correctly) that \(\mu\) and \(T_{\psi}^{*} \mu\) are mutually singular.

There are at least two problems with such an approach. First, \(\Phi^{3}-C \Phi\) does actually not define a random distribution, whether \(\Phi\) is distributed according to \(\mu\) or to the free field \(\nu\) (which guides the heuristic). This is because if it were, it would have a covariance behaving like \(|x-y|^{-3}\) around the diagonal, which is not integrable in dimension 3. The second problem is that such an argument suggests that, if \(\mu_{n}=\exp \left(-f_{n}\right) \nu\) for some "nice" probability measure \(\nu\) and functions \(f_{n}\) that fail to converge to a "nice" limit, then \(\mu_{n}\) fails to converge to a limit \(\mu\). This of course is not true: for a suitable (diverging) sequence of constants \(c_{n}\), the sequence \(f_{n}(x)=c_{n}+n \cos (n x)\) is such that if \(\nu\) is Lebesgue measure on \([0,1]\), then \(\mu_{n}\) converges weakly to Lebesgue measure even though the \(\log\)-densities \(f_{n}\) fail to converge. Any proof needs to be based on a different approach or to satisfactorily address these problems.

Notations We fix a space-time white noise \(\xi\) on \(\mathbb{R} \times \mathbb{T}^{3}\). We define \(\dagger\) as the stationary solution to the linear equation
\[
\left(\partial_{t}+1-\Delta\right) \uparrow=\xi, \quad \text { on } \mathbb{R} \times \mathbb{T}^{3}
\]
(We use the convention that symbols represent random space-time distributions rather than elements of a regularity structure.) Starting from this process, we define \(\vee\) and \(\vee\) as its Wick square and cube respectively, which are given by
\[
\vee=\lim _{N \rightarrow \infty} H_{2}\left(\uparrow_{N}, c_{N}\right), \quad \vee=\lim _{N \rightarrow \infty} H_{3}\left(\uparrow_{N}, c_{N}\right)
\]
where \(\uparrow_{N}=P_{N} \uparrow\) and \(c_{N}=\mathbb{E} i_{N}^{2}\) (which is constant in space and time). Here, \(P_{N}\) denotes the projection onto Fourier modes with \(|k| \leq N\) and \(H_{n}\) denotes the \(n\)th Hermite polynomial normalised such that \(H_{0} \equiv 1, H_{n}^{\prime}=n H_{n-1}\), and \(\mathbb{E} H_{n}(Z, 1)=0\) for a normal random variable \(Z\). The first convergence takes place in the space of continuous functions of time with values in \(\mathcal{C}^{-1-2 \kappa}\), while the second convergence takes place in the space-time parabolic space \(\mathcal{C}^{-\frac{3}{2}-3 \kappa}\).

With these notations in place, we define \(Y\) as the stationary solution to
\[
\left(\partial_{t}+1-\Delta\right) Y=V
\]
and similarly for \(\psi\). For a more comprehensive and pedagogical introduction to the general tree-like notation, we refer the reader to [4]. We also write " " for Bony's paraproduct (in space) as defined for example in [5, Sec. 2.1] and, given a random \(N\)-dependent process \(w\), we will sometimes use the physicists shorthand notation : \(w^{k}\) : instead of \(H_{k}\left(w, c_{N}\right)\).

Answer and Proof The statement is false. In particular, for any smooth function \(\psi \not \equiv 0\) and any choice of the parameters involved in the definition of \(\mu\) (mass and coupling constant, provided that the latter is non-zero), the measures \(\mu\) and \(T_{\psi}^{*} \mu\) are mutually singular.

For notational simplicity, we fix the mass and the coupling constant to 1 , but this has no incidence on the proof. Our main starting point is the following statement, a proof of which can be found for example in [6] and [7, Lemma 4.19] for (B.1), combined with [8] for (B.2) (see Ansatz 2.11 there). Throughout this proof, \(\kappa>0\) is chosen small enough ( \(\kappa=1 / 100\) is certainly sufficient).
Proposition B.1. There exists a stationary process \(v\) that is almost surely continuous in time with values in \(\mathcal{C}^{1-2 \kappa}\left(\mathbb{T}^{d}\right)\) and such that the process
\[
u=1-\Psi+v
\]
is stationary with fixed time distribution equal to \(\mu\). Furthermore, the process \(v\) is such that
\[
v=-3((v-\psi) \prec \gamma)+v^{\sharp}
\]
where \(v^{\sharp}\) is continuous with values in \(\mathcal{C}^{1+4 \kappa}\left(\mathbb{T}^{d}\right)\).
It was furthermore shown in [2, Lemmas 3.1 \& 3.4] (but see [9] for a similar result using a slightly different regularisation) that the processes \(\upharpoonright\) and \(\psi\) are almost surely continuous in time with values in \(\mathcal{C}^{-\frac{1}{2}-\kappa}\) and \(\mathcal{C}^{\frac{1}{2}-3 \kappa}\) respectively.

Before we proceed, we remind some notations and preliminary results. First of all, we define the additional diverging constant
\[
c_{N, 2}:=\mathbb{E}\left[\bigvee_{N} Y_{N}\right]
\]
where \(\bigvee_{N}:=P_{N} \bigvee\) and \(Y_{N}:=P_{N} Y\). The main ingredient of our proof is the event
\[
B^{\gamma}:=\left\{u \in \mathcal{D}^{\prime}: \lim _{N \rightarrow \infty}\left\langle(\log N)^{-\gamma}\left(H_{3}\left(P_{N} u ; c_{N}\right)+9 c_{N, 2} P_{N} u\right), \psi\right\rangle_{\mathbb{T}^{3}}=0\right\}
\]
which will be used to distinguish between the shifted and the non-shifted measures. Here, the limit \(N \rightarrow \infty\) is restricted to en exponentially growing sequence, for example \(N \in 2^{\mathbb{N}}\).

We will also use the following two technical lemmas whose proofs can be found in Section B.1. These are very similar to [2, Lemma 3.11 and Lemma 3.12].

Lemma B.2. Let \(\gamma>\frac{1}{2}\). Then, for any fixed \(t>0\),
\[
\lim _{N \rightarrow \infty}(\log N)^{-\gamma}:\left(1_{N}\right)^{3}:(t)=0
\]
almost surely in \(\mathcal{C}^{-\frac{3}{2}}\left(\mathbb{T}^{3}\right)\) and in \(L^{p}\left(\Omega ; \mathcal{C}^{-\frac{3}{2}}\left(\mathbb{T}^{3}\right)\right)\) for any \(p>0\).
Lemma B.3. For \(N\) large, one has \(c_{N, 2} \gtrsim \log N\).
The following results are essentially standard, but we recall their statements for later reference.
Lemma B.4. For any polynomial \(P\), the expression \(\uparrow_{N} P\left(\Psi_{N}\right)\) converges almost surely to some finite limit in \(\mathcal{C}^{-\frac{1}{2}-\kappa}\).

Proof. By paralinearisation and standard commutator estimates (see [5, Lems 2.4 \& 2.6]) it suffices to consider the case \(P(x)=x\). This is by now standard, see for example [8, Sec. 4.4].

Lemma B.5. Let \(v\) be a process satisfying the decomposition (B.2). Then, the expressions \(: \mathfrak{l}_{N}^{2}: \Psi_{N}-3 c_{N, 2} \mathfrak{l}_{N}\) and \(: \mathfrak{l}_{N}^{2}: v_{N}+3 c_{N, 2}\left(v_{N}-\Psi_{N}\right)\) both converge almost surely to finite limits in \(\mathcal{C}^{-1-2 \kappa}\) as \(N \rightarrow \infty\).

Proof. Regarding the first expression, its convergence was essentially for example in [8, Sec. 4.6]. (The approximation used there is slightly different, but the differences are unimportant.) Regarding the second expression, the claim follows from [8, Sec. 4.5] (modulo again unimportant changes in the approximation scheme), combined with the commutator estimate [5, Lem. 2.4].

We now turn to the proof of the main claim. For this, we first claim that if \(u\) is as in (B.1), then, for any fixed \(t\), one has \(u(t) \in B^{\gamma}\). Indeed, writing \(u_{N}\) as a shorthand for \(P_{N} u\) and expanding the Wick power, we have
\[
\begin{aligned}
(\log N)^{-\gamma} & H_{3}\left(u_{N} ; c_{N}\right)=(\log N)^{-\gamma} H_{3}\left(\left(\uparrow_{N}-\psi_{N}+v_{N}\right) ; c_{N}\right) \\
& =(\log N)^{-\gamma} \sum_{i=0}^{3}\binom{3}{i}:\left(\uparrow_{N}\right)^{i}:\left(-\psi_{N}+v_{N}\right)^{3-i} \\
& =(\log N)^{-\gamma} \sum_{i=0}^{3} \sum_{j=0}^{3-i}\binom{3}{i}\binom{3-i}{j}:\left(\uparrow_{N}\right)^{i}:\left(-\psi_{N}\right)^{j}\left(v_{N}\right)^{3-i-j} \\
& =(\log N)^{-\gamma}:{{ }_{N}^{N}}^{3}:-3(\log N)^{-\gamma}: \ell_{N}^{2}: \psi_{N}+3(\log N)^{-\gamma}: \ell_{N}^{2}: v_{N} \\
& \quad+(\log N)^{-\gamma} \sum_{\substack{0 \leq i+j \leq 3 \\
(i, j) \neq(3,0),(2,1),(2,0)}}\binom{3}{i}\binom{3-i}{j}:\left(\uparrow_{N}\right)^{i}:\left(-\psi_{N}\right)^{j}\left(v_{N}\right)^{3-i-j}
\end{aligned}
\]

The first term \((\log N)^{-\gamma}::_{N}^{3}\) : and the terms present in the last sum all converge to 0 by Lemma B. 2 (given that \(\gamma>\frac{1}{2}\) ), standard product estimates (e.g. [10, Theorem 2.5] or [4, Proposition 2.3]) and Lemma B.4.

It therefore remains to show that \(-::_{N}^{2}: \psi_{N}+::_{N}^{2}: v_{N}+3 c_{N, 2} u_{N}\) also converges to zero almost surely in the sense of distributions. We rewrite this term as
\[
:_{N}^{2}: v_{N}+3 c_{N, 2}\left(v_{N}-\Psi_{N}\right)-\left(::_{N}^{2}: \Psi_{N}-3 c_{N, 2} \uparrow_{N}\right) .
\]

By Lemma B. 5 we know that this expression converges to an element of \(\mathcal{C}^{-1-2 \kappa}\left(\mathbb{T}^{d}\right)\), whence we conclude that
\[
\left\langle(\log N)^{-\gamma}\left(-::_{N}^{2}: \Psi_{N}+::_{N}^{2}: v_{N}+3 c_{N, 2} u_{N}\right), \psi\right\rangle \xrightarrow{N \rightarrow \infty} 0
\]
almost surely, thus proving that \(\mu\left(B^{\gamma}\right)=1\).
In order to conclude the proof, it suffices to show that \(u+\psi \notin B^{\gamma}\). For this, we expand similarly to before the expression appearing in this event as
\[
\begin{aligned}
(\log N)^{-\gamma} & H_{3}\left(\left(u_{N}+\psi_{N}\right) ; c_{N}\right)+(\log N)^{-\gamma} 9 c_{N, 2}\left(u_{N}+\psi_{N}\right) \\
= & (\log N)^{-\gamma} \sum_{i=0}^{3}\binom{3}{i}:\left(u_{N}\right)^{i}:\left(\psi_{N}\right)^{3-i}+(\log N)^{-\gamma} 9 c_{N, 2}\left(u_{N}+\psi_{N}\right) \\
= & (\log N)^{-\gamma}:\left(u_{N}\right)^{3}:+(\log N)^{-\gamma} 9 c_{N, 2} u_{N} \\
& \quad+3(\log N)^{-\gamma}:\left(u_{N}\right)^{2}:\left(\psi_{N}\right)+3(\log N)^{-\gamma}\left(u_{N}\right)\left(\psi_{N}\right)^{2} \\
& \quad+(\log N)^{-\gamma}\left(\psi_{N}\right)^{3}+(\log N)^{-\gamma} 9 c_{N, 2} \psi_{N}
\end{aligned}
\]

The sum of the first two terms was just shown to converge to 0 almost surely in \(\mathcal{C}^{-\frac{3}{2}-3 \kappa}\left(\mathbb{T}^{d}\right)\) for \(N \rightarrow \infty\).

Since : \(u_{N}^{2}\) : and \(u_{N}\) both converge to finite distributional limits almost surely by Lemma B. 4 , the next three terms also converge to 0 almost surely.

Concerning the last element however, we know from Lemma B. 3 that
\[
(\log N)^{-\gamma} c_{N, 2} \gtrsim(\log N)^{-\gamma+1}
\]

Since the contribution of this term to the expression in the event \(B^{\gamma}\) is given by
\[
9(\log N)^{-\gamma} c_{N, 2}\left\langle\psi_{N}, \psi\right\rangle
\]
and since \(\left\langle\psi_{N}, \psi\right\rangle \rightarrow\|\psi\|^{2}>0\), this diverges, whence we conclude that \(u+\psi \notin B^{\gamma}\) and therefore \(\left(T_{\psi}^{*} \mu\right)\left(B^{\gamma}\right)=0\), so that \(T_{\psi}^{*} \mu\) and \(\mu\) are mutually singular.

\section*{Proof of the lemmas}

Proof of Lemma B.2. We use the embedding \(W^{\beta, 2 p} \hookrightarrow W^{\beta-\frac{d}{2 p}, \infty} \hookrightarrow \mathcal{C}^{\beta-\frac{d}{2 p}}\), with \(\beta=-\frac{d}{2}\). Using the definition of \(W^{\beta, 2 p}\) norm and the equivalence of moments for Gaussian polynomials, one has
\[
\mathbb{E}\left[\left\|(\log N)^{-\gamma}:\left(\uparrow_{N}\right)^{J}:\right\|_{W^{-\frac{3}{2}, 2 p}}^{2 p}\right] \lesssim \int_{\mathbb{T}^{d}} \mathbb{E}\left[(\log N)^{-2 \gamma}\left|\langle\nabla\rangle^{-\frac{3}{2}}:\left(\uparrow_{N}\right)^{3}:\right|^{2}\right]^{p} d x
\]

Since one has
\[
\begin{aligned}
\mathbb{E}\left[(\log N)^{-2 \gamma}\left|\langle\nabla\rangle^{-\frac{3}{2}}:\left(\left.\right|_{N}\right)^{3}:\right|^{2}\right] & \lesssim(\log N)^{-2 \gamma} \sum_{\left|\omega_{i}\right| \leq N}\left\langle\omega_{1}+\cdots+\omega_{3}\right\rangle^{-3} \prod_{i=1}^{3}\left\langle\omega_{i}\right\rangle^{-2} \\
& \lesssim(\log N)^{-2 \gamma} \sum_{r_{1}=0}^{N} \frac{r_{1}^{2}}{\left(1+r_{1}^{2}\right)^{\frac{5}{2}}} r_{1}^{2} \lesssim(\log N)^{-2 \gamma+1}
\end{aligned}
\]
the desired result follows from a standard Borel-Cantelli argument.

Next, we prove Lemma B.3, which provides a lower bound on the parameter \(\gamma\). This bound ensures that the event \(A^{\gamma}\) (or \(B^{\gamma}\) ) is distinguishable under the shifted measure when compared to the non-shifted one.

Proof of Lemma B. 3 Expanding the definition of \(c_{N, 2}:=\mathbb{E}\left[\vee_{N} Y_{N}\right]\), we get
\[
\begin{aligned}
c_{N, 2} & =2 \sum_{\substack{\omega_{1}+\omega_{2}=\omega_{3} \\
\left|\omega_{i}\right| \leq N}} \int_{\mathbb{R}} \hat{P}_{t-u}\left(\omega_{3}\right) \int_{\mathbb{R}} \hat{P}_{t-u_{1}}\left(\omega_{1}\right) \hat{P}_{u-u_{1}}\left(-\omega_{1}\right) d u_{1} \\
& \times \int_{\mathbb{R}} \hat{P}_{t-u_{2}}\left(\omega_{2}\right) \hat{P}_{u-u_{2}}\left(-\omega_{2}\right) d u_{2} d u \\
& \simeq \sum_{\substack{\omega_{1}+\omega_{2}=\omega_{3} \\
\left|\omega_{i}\right| \leq N}} \int_{\mathbb{R}} e^{-|t-u|\left\langle\omega_{3}\right\rangle^{2}} \frac{e^{-|t-u|\left\langle\omega_{1}\right\rangle^{2}}}{\left\langle\omega_{1}\right\rangle^{2}} \frac{e^{-|t-u|\left\langle\omega_{2}\right\rangle^{2}}}{\left\langle\omega_{2}\right\rangle^{2}} d u \\
& \gtrsim \sum_{\left|\omega_{i}\right| \leq N} \frac{1}{\left\langle\omega_{1}\right\rangle^{2}} \frac{1}{\left\langle\omega_{2}\right\rangle^{2}} \frac{1}{\left\langle\omega_{1}\right\rangle^{2}+\left\langle\omega_{2}\right\rangle^{2}+\left\langle\omega_{1}+\omega_{2}\right\rangle^{2}} \\
& \gtrsim \sum_{\left|\omega_{i}\right| \leq N} \frac{1}{1+\left|\omega_{1}\right|^{2}} \frac{1}{1+\left|\omega_{2}\right|^{2}} \frac{1}{1+\left|\omega_{1}\right|^{2} \bigvee\left|\omega_{2}\right|^{2}} \\
& \gtrsim \sum_{\left|\omega_{1}\right| \leq\left|\omega_{2}\right| \leq N} \frac{1}{1+\left|\omega_{1}\right|^{2}} \frac{1}{1+\left|\omega_{2}\right|^{4}}
\end{aligned}
\]

Bounding the sum by an integral, we finally conclude that this expression is bounded from below by a multiple of
\[
\int_{0}^{N} \frac{r^{2}}{1+r^{2}} \int_{r}^{\infty} \frac{s^{2}}{1+s^{4}} d s d r \gtrsim \int_{0}^{N} \frac{r}{1+r^{2}} d r \simeq \log N
\]
as claimed.

\section*{B.1.1 References}
[1] M. Hairer and J. Peroni. Quasi shift invariance of \(\Phi^{4}\) measures. To appear.
[2] M. Hairer, S. Kusuoka, and H. Nagoji. Singularity of solutions to singular SPDEs. Preprint, arXiv:2409.10037, 2024.
[3] J. Glimm. Boson fields with the \(\Phi^{4}\) interaction in three dimensions. Comm. Math. Phys., 10(1):1-47, 1968.
[4] J.-C. Mourrat, H. Weber, and W. Xu. Construction of \(\Phi_{3}^{4}\) diagrams for pedestrians. In From Particle Systems to Partial Differential Equations, volume 209 of Springer Proc. Math. Stat., pages 1-46. Springer, Cham, 2017.
[5] M. Gubinelli, P. Imkeller, and N. Perkowski. Paracontrolled distributions and singular PDEs. Forum Math. Pi, 3:e6, 75 pp., 2015.
[6] M. Hairer and K. Matetski. Discretisations of rough stochastic PDEs. Ann. Probab., 46(3):16511709, 2018.
[7] S. Esquivel and H. Weber. A priori bounds for the dynamic fractional \(\Phi^{4}\) model on \(\mathbb{T}^{3}\) in the full subcritical regime. Preprint, arXiv:2411.16536, 2024.
[8] R. Catellier and K. Chouk. Paracontrolled distributions and the 3-dimensional stochastic quantization equation. Ann. Probab., 46(5):2621-2679, 2018.
[9] M. Hairer. A theory of regularity structures. Invent. Math., 198(2):269-504, 2014.
[10] J.-M. Bony. Calcul symbolique et propagation des singularités pour les équations aux dérivées partielles non linéaires. Ann. Sci. École Norm. Sup. (4), 14(2):209-246, 1981.

\section*{B. 2 Question 2: Paul Nelson}

Author: Paul D. Nelson

Question Let \(F\) be a non-archimedean local field with ring of integers \(\mathfrak{o}\). Let \(N_{r}\) denote the subgroup of \(\mathrm{GL}_{r}(F)\) consisting of upper-triangular unipotent elements. Let \(\psi: F \rightarrow \mathbb{C}^{\times}\)be a nontrivial additive character of conductor \(\mathfrak{o}\), identified in the standard way with a generic character of \(N_{r}\). Let \(\Pi\) be a generic irreducible admissible representation of \(\mathrm{GL}_{n+1}(F)\), realized in its \(\psi^{-1}\)-Whittaker model \(\mathcal{W}\left(\Pi, \psi^{-1}\right)\). Must there exist \(W \in \mathcal{W}\left(\Pi, \psi^{-1}\right)\) with the following property?

Let \(\pi\) be a generic irreducible admissible representation of \(\mathrm{GL}_{n}(F)\), realized in its \(\psi\)-Whittaker model \(\mathcal{W}(\pi, \psi)\). Let \(\mathfrak{q}\) denote the conductor ideal of \(\pi\), let \(Q \in F^{\times}\)be a generator \(\mathfrak{q}^{-1}\), and set
\[
u_{Q}:=I_{n+1}+Q E_{n, n+1} \in \mathrm{GL}_{n+1}(F)
\]
where \(E_{i, j}\) is the matrix with a 1 in the \((i, j)\)-entry and 0 elsewhere. For some \(V \in \mathcal{W}(\pi, \psi)\), the local Rankin-Selberg integral
\[
\int_{N_{n} \backslash \mathrm{GL}_{n}(F)} W\left(\operatorname{diag}(g, 1) u_{Q}\right) V(g)|\operatorname{det} g|^{s-\frac{1}{2}} d g
\]
is finite and nonzero for all \(s \in \mathbb{C}\).
Statement Let \(F\) be a non-archimedean local field with ring of integers \(\mathfrak{o}\). Let \(\psi: F \rightarrow \mathbb{C}^{\times}\) be a nontrivial additive character of conductor \(\mathfrak{o}\). We write
\[
G_{r}:=\mathrm{GL}_{r}(F)
\]
and let \(N_{r}<G_{r}\) denote the subgroup of upper-triangular unipotent elements. We embed \(G_{n} \hookrightarrow G_{n+1}\) as the upper-left block. We write \(E_{i j}\) for the matrix with a 1 in the \((i, j)\)-entry and 0 elsewhere.

A more precise form of the following "lemma" will appear in forthcoming joint work with Subhajit Jana. It says informally that pure unipotent translates of fixed vectors in the Whittaker model of a representation of \(G_{n+1}\) may serve as test vectors for Rankin-Selberg integrals against all representations of \(G_{n}\) with a given conductor.

Theorem 1. Let \(\Pi\) be a generic irreducible admissible representation of \(G_{n+1}\), realized in its \(\psi^{-1}\)-Whittaker model \(\mathcal{W}\left(\Pi, \psi^{-1}\right)\). Then there exists \(W \in \mathcal{W}\left(\Pi, \psi^{-1}\right)\) with the following property. Let \(\pi\) be a generic irreducible admissible representation of \(G_{n}\), realized in its \(\psi\)-Whittaker model \(\mathcal{W}(\pi, \psi)\). Let \(\mathfrak{q}\) denote the conductor ideal of \(\pi\), let \(Q \in F^{\times}\)be a generator of \(\mathfrak{q}^{-1}\), and set
\[
u_{Q}:=I_{n+1}+Q E_{n, n+1} \in G_{n+1}
\]

There exists \(V \in \mathcal{W}(\pi, \psi)\) so that the local Rankin-Selberg integral
\[
\int_{N_{n} \backslash G_{n}} W\left(\operatorname{diag}(g, 1) u_{Q}\right) V(g)|\operatorname{det} g|^{s-\frac{1}{2}} d g
\]
is finite and nonzero for all \(s \in \mathbb{C}\).

Context Rankin-Selberg local zeta integrals arise as proportionality factors relating global Rankin-Selberg integrals and \(L\)-functions. The above result provides test vectors, obtained via pure translates of fixed vectors, that work simultaneously for all representations of the smaller group having some given conductor. Such results are sometimes useful in global applications because they relate problems concerning \(L\)-functions (subconvexity, moment asymptotics, ...) to problems concerning automorphic forms (quantitative equidistribution, …). The \(n=1\) case follows from standard properties of Gauss sums and stationary phase analysis in one variable; it has been applied in, e.g., [7, 6]. For general \(n\), [2] contains a similar result, but with an average over many unipotent translates rather than just one.

Proof We first sketch the argument. The basic idea is to apply the Godement-Jacquet functional to the Whittaker function on the smaller group. This is readily seen to relate the unipotent-shifted Rankin-Selberg integral to an integral involving a translate of the standard congruence subgroup \(K_{1}(\mathfrak{q}) \leq \mathrm{GL}_{n}(\mathfrak{o})\), consisting of matrices whose last row is congruent to \((0, \ldots, 0,1)\) modulo \(\mathfrak{q}\). We then conclude via newvector theory.

Turning to details, we recall that \(F\) is a non-archimedean local field, with ring of integers \(\mathfrak{o}\). We denote by \(\mathfrak{p}\) the maximal ideal and \(q\) the residue field cardinality. We set \(K_{r}:=\mathrm{GL}_{r}(\mathfrak{o})\) and equip \(G_{r}\) and \(N_{r}\) with the Haar measures assigning volume one to \(K_{r}\) and \(N_{r} \cap K_{r}\), respectively. As in the theorem statement, we write \(\Pi\) (resp. \(\pi\) ) for a generic irreducible representation of \(G_{n+1}\) (resp. \(G_{n}\) ).

We continue to denote by \(\mathfrak{q}\) the conductor ideal of \(\pi\), defined to be the smallest ideal for which \(\pi\) has a nonzero vector fixed by \(K_{1}(\mathfrak{q})\). We choose a generator \(Q\) for \(\mathfrak{q}^{-1}\), so that \(|Q|=[\mathfrak{o}: \mathfrak{q}]\). We recall (see [4, 5]) that \(|Q|\) (and hence \(\mathfrak{q}\) ) may also be characterized in terms of the local \(\varepsilon\)-factor of \(\pi\) :
\[
\varepsilon\left(\frac{1}{2}+s, \pi, \psi\right)=|Q|^{-s} \varepsilon\left(\frac{1}{2}, \pi, \psi\right)
\]

We recall the functional equation of Godement-Jacquet [3, Theorem 3.3].
Lemma 2. Let \(f\) be a matrix coefficient of \(\pi\), and let \(\phi \in \mathcal{S}\left(M_{n}(F)\right)\). For \(s \in \mathbb{C}\), the local zeta integral
\[
Z(\phi, f, s):=\int_{G_{n}} \phi(g) f(g)|\operatorname{det} g|^{\frac{n-1}{2}+s} d g
\]
converges absolutely for \(\Re(s)\) sufficiently large. It extends to a meromorphic function on the complex plane for which the ratio
\[
\frac{Z(\phi, f, s)}{L(s, \pi)}
\]
is holomorphic. It satisfies the local functional equation
\[
\gamma(s, \pi, \psi) Z(\phi, f, s)=Z\left(\phi^{\wedge}, f^{\vee}, 1-s\right)
\]
where
\[
\gamma(s, \pi, \psi)=\varepsilon(s, \pi, \psi) \frac{L(1-s, \tilde{\pi})}{L(s, \pi)}
\]
with \(\tilde{\pi}\) the contragredient of \(\pi\), and where the Fourier transform is defined by
\[
\begin{gathered}
f^{\vee}(g):=f\left(g^{-1}\right) \\
\phi^{\wedge}(x):=\int_{M_{n}(F)} \phi(y) \psi(\operatorname{trace}(x y)) d y
\end{gathered}
\]
with \(M_{n}\) the space of \(n \times n\) matrices and the Haar measure normalized to be self-dual with respect to \(\psi\). Moreover, both of the zeta integrals in (B.3) converge absolutely provided that, e.g., \(\pi\) is unitary and generic and \(\Re(s)=1 / 2\).

We recall that a matrix coefficient of \(\pi\) is a linear combination of functions of the form \(f(g)=\ell(g v)\), where \(v \in \pi\) and \(\ell\) lies in the contragredient of \(\pi\) (i.e., the admissible dual). The conclusions of Lemma 2 remain valid for more general coefficients of \(\pi\). For instance, suppose more generally that \(f\) is of the same form, but with \(\ell\) allowed to be any linear functional on \(\pi\) (not necessarily in the admissible dual). Given \(\phi\) as above, we may choose a compact open subgroup \(U\) of \(G_{n}\) under which \(\phi\) is bi-invariant. The integrals in question do not change if we then replace \(f\) by its two-sided average with respect to \(U\), which has the effect of replacing \(v\) by its average \(v^{U} \in \pi^{U}\) and \(\ell\) with its projection \(\ell^{U}\) to the dual of \(\pi^{U}\), extended by zero on the kernel of the averaging operator \(\pi \rightarrow \pi^{U}\). In particular, by specializing to the case that \(\ell\) is a Whittaker functional on \(\pi\), we see that such identities remain valid when \(f\) is a Whittaker function for \(\pi\).

We denote by \(\mathcal{S}^{e}\left(F^{\times}\right)\)the space of all Schwartz-Bruhat functions \(\beta \in \mathcal{S}\left(F^{\times}\right)\)such that \(\beta(x y)=\beta(x)\) whenever \(|y|=1\), or equivalently, for which \(\beta(x)\) depends only upon \(|x|\). We note that each \(\beta \in \mathcal{S}^{e}\left(F^{\times}\right)\)satisfies the Mellin inversion formula
\[
\beta(y)=\int_{(\sigma)} \tilde{\beta}(s)|y|^{s} d s, \quad \tilde{\beta}(s):=\int_{F^{\times}} \beta(y)|y|^{-s} d^{\times} y
\]

For \(\beta \in \mathcal{S}^{e}\left(F^{\times}\right)\), we define the transform \(\beta^{\sharp}:=\beta^{\sharp, \pi}\) of \(\beta\) by
\[
\beta^{\sharp}(y):=\int_{(\sigma)} \frac{\tilde{\beta}(s)|y|^{-s} d s}{\gamma\left(\frac{1}{2}+s, \pi, \psi\right)},
\]
initially for \(\sigma\) large enough.

Lemma 3. Define \(\beta\) via Mellin inversion ( B.4) by
\[
\tilde{\beta}(s):=\frac{\varepsilon\left(\frac{1}{2}+s, \pi, \psi\right)}{L\left(\frac{1}{2}+s, \pi\right)}
\]

Then:
1. \(\beta\) is supported on \(\left\{y:|Q| \leq|y| \leq|Q| q^{n}\right\}\) and takes the value \(\varepsilon\left(\frac{1}{2}, \pi, \psi\right)\) on \(\{y:|y|=|Q|\}\).
2. \(\beta^{\sharp}\) is supported on \(\left\{y: 1 \leq|y| \leq q^{n}\right\}\) and takes the value 1 on \(\{y:|y|=1\}=\mathfrak{o}^{\times}\).

Proof. We appeal to the characterization (B.1) of \(|Q|\). We note first that \(\beta^{\sharp}\) has Mellin transform
\[
\widetilde{\beta^{\sharp}}(s)=\frac{1}{L\left(\frac{1}{2}+s, \tilde{\pi}\right)}
\]

Since the inverse \(L\)-values appearing above are monic polynomials in \(q^{-s}\) of degree at most \(n\), we see by Mellin inversion that \(\beta\) and \(\beta^{\sharp}\) have the claimed properties.

Lemma 4. Assume that \(\pi\) is unitary and generic. We then have the identity of absolutely convergent integrals
\[
\int_{G_{n}} \phi(g) f(g) \beta(\operatorname{det} g)|\operatorname{det} g|^{\frac{n}{2}} d g=\int_{G_{n}} \phi^{\wedge}(g) f^{\vee}(g) \beta^{\sharp}(\operatorname{det} g)|\operatorname{det} g|^{\frac{n}{2}} d g .
\]

Proof. Starting with the left hand side, we insert the Mellin expansion of \(\beta\), with \(\sigma=0\). The resulting double integral over \(g\) and \(s\) converges absolutely, so we may swap the order. We recognize the result as the integral \(\int_{(0)} \tilde{\beta}(s) Z\left(\phi, f, \frac{1}{2}+s\right) d s\) involving the Godement-Jacquet zeta integral (B.2). We now apply the local functional equation and expand the result as
\[
\int_{(0)} \frac{\tilde{\beta}(s)}{\gamma\left(\frac{1}{2}+s, \pi, \psi\right)}\left(\int_{G_{n}} \phi^{\wedge}(g) f^{\vee}(g)|\operatorname{det} g|^{\frac{n}{2}-s} d g\right) d s
\]

This double integral again converges absolutely, so we may rearrange it to obtain the stated identity.

For the same reasons as indicated following the statement of Lemma 2, such identities persist for more general coefficients than matrix coefficients, and in particular, when \(f\) is a Whittaker function.

Recall that we embed \(G_{n} \hookrightarrow G_{n+1}\) as the upper-left block. We set
\[
W_{0}(g):=\int_{N_{n}} 1_{K_{n}}(x g) \psi(x) d x
\]
which defines a Whittaker function on \(G_{n}\) and extends, by the theory of the Kirillov model [1], to an element of \(\mathcal{W}\left(\Pi, \psi^{-1}\right)\) on \(G_{n+1}\).

For \(x \in F\) and \(y \in F^{\times}\), we set
\[
d_{y}:=\operatorname{diag}(1, \ldots, 1, y) \in G_{n} \hookrightarrow G_{n+1}, \quad u_{x}:=I_{n+1}+x E_{n, n+1} \in N_{n+1}
\]

We then define
\[
t_{Q}:=d_{Q}^{-1} u_{Q}=u_{1} d_{Q}^{-1}
\]

Lemma 5. There exist \(\beta \in \mathcal{S}^{e}\left(F^{\times}\right)\)and \(\phi \in \mathcal{S}\left(M_{n}(F)\right)\) so that for all \(g \in G_{n}\), we have
\[
\int_{N_{n}} \beta(\operatorname{det} x g) \phi(x g) \psi(x) d x=\varepsilon\left(\frac{1}{2}, \pi, \psi\right) W_{0}\left(g t_{Q}\right)
\]
and
\[
\beta^{\sharp}(\operatorname{det} g) \phi^{\wedge}(g)=|Q|^{n} 1_{K_{1}(\mathfrak{q})}(g) .
\]

Proof. We set
\[
\begin{gathered}
\phi_{0}:=1_{M_{n}(\mathfrak{o})} \\
\phi(x):=\psi\left(-x_{n n}\right) \phi_{0}\left(x d_{Q}^{-1}\right)
\end{gathered}
\]
and take \(\beta\) as in Lemma 3, so that in particular,
\[
\left.\beta\right|_{Q_{\mathfrak{o}}}=\varepsilon\left(\frac{1}{2}, \pi, \psi\right) 1_{Q^{\mathfrak{a}}}
\]
and
\[
\left.\beta^{\sharp}\right|_{\mathfrak{o}}=1_{\mathfrak{o}} \times .
\]

We must verify the relations (B.7) and (B.8).
We start with (B.7). Recall from (B.6) that \(W_{0}\) is the \(\psi^{-1}\)-Whittaker function \(W_{0}(g)= \int_{N_{n}} 1_{K_{n}}(x g) \psi(x) d x\). In particular,
\[
W_{0}\left(g t_{Q}\right)=W_{0}\left(g u_{1} d_{Q}^{-1}\right)=\psi\left(-g_{n n}\right) W_{0}\left(g d_{Q}^{-1}\right)
\]

Using this identity, we may rewrite the desired relation (B.7) as
\[
\int_{N_{n}} \beta(\operatorname{det}(x g)) \phi(x g) \psi(x) d x=\varepsilon\left(\frac{1}{2}, \pi, \psi\right) \psi\left(-g_{n n}\right) W_{0}\left(g d_{Q}^{-1}\right)
\]

We verify this as follows. First, we see from the definition (B.9) and the identity \((x g)_{n n}=g_{n n}\) that for \(x \in N_{n}\) and \(g \in G_{n}\), we have
\[
\phi(x g)=\psi\left(-g_{n n}\right) \phi_{0}\left(x g d_{Q}^{-1}\right)
\]

Next, we have
\[
\begin{aligned}
\beta(\operatorname{det} g) \phi_{0}\left(g d_{Q}^{-1}\right) & =\varepsilon\left(\frac{1}{2}, \pi, \psi\right) 1_{Q_{0} \times}(\operatorname{det} g) \phi_{0}\left(g d_{Q}^{-1}\right) \\
& =\varepsilon\left(\frac{1}{2}, \pi, \psi\right) 1_{K_{n}}\left(g d_{Q}^{-1}\right)
\end{aligned}
\]
(In the first step, we use that \(\phi_{0}\left(g d_{Q}^{-1}\right)\) is nonzero only if \(\operatorname{det}(g) \in Q \mathfrak{o}\) and apply (B.10). In the second step, we use that \(1_{K_{n}}(g)=1_{\mathfrak{o}^{\circ}}(\operatorname{det} g) \phi_{0}(g)\) and \(\operatorname{det}\left(d_{Q}\right)=Q\), which gives \(1_{Q_{\mathfrak{o}} \times}(\operatorname{det} g) \phi_{0}\left(g d_{Q}^{-1}\right)= 1_{K_{n}}\left(g d_{Q}^{-1}\right)\).) Combining the above identities, we obtain
\[
\beta(\operatorname{det}(x g)) \phi(x g)=\varepsilon\left(\frac{1}{2}, \pi, \psi\right) \psi\left(-g_{n n}\right) 1_{K_{n}}\left(x g d_{Q}^{-1}\right)
\]

Integrating both sides against \(\psi(x) d x\) gives (B.13), as required.

We verify ( \(\overline{\mathrm{B} .8}\) as as follows (here \(E_{i j}\) denotes the elementary matrix):
\[
\begin{aligned}
\beta^{\sharp}(\operatorname{det} g) \phi^{\wedge}(g) & =1_{\mathfrak{o} \times}(\operatorname{det} g) \phi^{\wedge}(g) \\
& =1_{\mathfrak{o} \times}(\operatorname{det} g)|Q|^{n} \phi_{0}^{\wedge}\left(d_{Q}\left(g-E_{n n}\right)\right) \\
& =|Q|^{n} 1_{\mathfrak{o}} \times(\operatorname{det} g) 1_{M_{n}(\mathfrak{o})}\left(d_{Q}\left(g-E_{n n}\right)\right) \\
& =|Q|^{n} 1_{K_{1}(\mathfrak{q})}(g) .
\end{aligned}
\]

Here, for the first step, we observed that \(\phi^{\wedge}(x)\) is nonzero only if \(x \in E_{n n}+d_{Q}^{-1} M_{n}(\mathfrak{o}) \subseteq M_{n}(\mathfrak{o})\), so that, in particular, \(\operatorname{det} x \in \mathfrak{o}\); we then applied (B.11). For the second step, we applied the general Fourier analytic calculation
\[
\phi^{\wedge}(x)=|Q|^{n} \phi_{0}^{\wedge}\left(d_{Q}\left(x-E_{n n}\right)\right) .
\]

For the third, we applied the Fourier self-duality \(\phi_{0}^{\wedge}=\phi_{0}=1_{M_{n}(\mathfrak{o})}\). For the final step, we use that \(K_{1}(\mathfrak{q})\) consists of all \(x \in M_{n}(F)\) for which \(d_{Q}\left(x-E_{n n}\right) \in M_{n}(\mathfrak{o})\) and \(\operatorname{det} x \in \mathfrak{o}^{\times}\).

For \(W \in \mathcal{W}\left(\Pi, \psi^{-1}\right), V \in \mathcal{W}(\pi, \psi)\), and \(s \in \mathbb{C}\), we define the Rankin-Selberg integral
\[
\ell_{\mathrm{RS}}(s, W, V):=\int_{N_{n} \backslash G_{n}} W(\operatorname{diag}(g, 1)) V(g)|\operatorname{det} g|^{s-\frac{1}{2}} d g
\]

The following result verifies Theorem 1 in a more precise form.
Proposition 6. Let \(W_{0} \in \mathcal{W}\left(\Pi, \psi^{-1}\right)\) be such that for all \(g \in G_{n}\), we have
\[
W_{0}(g)=\int_{N_{n}} 1_{K_{n}}(x g) \psi(x) d x
\]

Let \(V \in \mathcal{W}(\pi, \psi)\) denote the normalized newvector (i.e., the unique \(K_{1}(\mathfrak{q})\)-invariant vector for which \(V(1)=1\), see [4, 5]). Then for all \(s \in \mathbb{C}\), we have
\[
\ell_{\mathrm{RS}}\left(s, u_{Q} W_{0}, d_{Q} V\right)=c|Q|^{-\frac{n}{2}}
\]
where
\[
c:=\varepsilon\left(\frac{1}{2}, \pi, \psi\right)^{-1}|Q|^{n} \operatorname{vol}\left(K_{1}(\mathfrak{q})\right) \asymp 1 .
\]

Proof. We note first that, by a change of variables, we have the homogeneity property
\[
\ell_{\mathrm{RS}}\left(s, u_{Q} W_{0}, d_{Q} V\right)=|Q|^{-\left(s-\frac{1}{2}\right)} \ell_{\mathrm{RS}}\left(s, t_{Q} W_{0}, V\right)
\]

In view of this, the desired identity (B.17) is equivalent to
\[
\ell_{\mathrm{RS}}\left(s, t_{Q} W_{0}, V\right)=c|Q|^{s-\frac{n+1}{2}}
\]

Next, since \(W_{0}\) is supported on \(\operatorname{det}^{-1}\left(\mathfrak{o}^{\times}\right)\), we see that the translate \(t_{Q} W_{0}\) is supported on \(\operatorname{det}^{-1}\left(Q \mathfrak{o}^{\times}\right)\), so the left hand side of (B.20) is a constant multiple of \(|Q|^{s}\). For this reason, it suffices to verify (B.20)
for (say) \(s=\frac{n+1}{2}\), where our task is to check that \(\ell_{\mathrm{RS}}\left(\frac{n+1}{2}, t_{Q} W_{0}, V\right)=c\). Inserting definitions and unfolding, we obtain, with \(f(g):=V(g)\),
\[
\begin{aligned}
\varepsilon\left(\frac{1}{2}, \pi, \psi\right) \ell_{\mathrm{RS}}\left(\frac{n+1}{2}, t_{Q} W_{0}, V\right) & \stackrel{\text { B. } 16}{=} \varepsilon\left(\frac{1}{2}, \pi, \psi\right) \int_{N_{n} \backslash G_{n}} W_{0}\left(g t_{Q}\right) V(g)|\operatorname{det}(g)|^{\frac{n}{2}} d g \\
& \stackrel{\text { B. } 7}{=} \int_{G_{n}} \phi(g) f(g) \beta(\operatorname{det} g)|\operatorname{det} g|^{n / 2} d g \\
& \stackrel{\text { B. } 5}{=} \int_{G_{n}} \phi^{\wedge}(g) f^{\vee}(g) \beta^{\sharp}(\operatorname{det} g)|\operatorname{det} g|^{n / 2} d g \\
& \stackrel{\text { B. } 8}{=}|Q|^{n} \int_{K_{1}(\mathfrak{q})} V\left(g^{-1}\right)|\operatorname{det} g|^{n / 2} d g \\
& =|Q|^{n} \operatorname{vol}\left(K_{1}(\mathfrak{q})\right)
\end{aligned}
\]
where in the final step, we use the \(K_{1}(\mathfrak{q})\)-invariance of \(V\), the normalization \(V(1)=1\), and the fact that \(|\operatorname{det} g|=1\) on \(K_{1}(\mathfrak{q})\). Thus (B.20) holds.

\section*{B.2.1 References}
[1] Joseph N. Bernstein. \(P\)-invariant distributions on \(\operatorname{GL}(N)\) and the classification of unitary representations of GL( \(N\) ) (non-Archimedean case). In Lie group representations, II (College Park, Md., 1982/1983), volume 1041 of Lecture Notes in Math., pages 50-102. Springer, Berlin, 1984.
[2] Andrew R. Booker, M. Krishnamurthy, and Min Lee. Test vectors for Rankin-Selberg \(L\)-functions. J. Number Theory, 209:37-48, 2020.
[3] Roger Godement and Hervé Jacquet. Zeta functions of simple algebras. Lecture Notes in Mathematics, Vol. 260. Springer-Verlag, Berlin, 1972.
[4] H. Jacquet, I. I. Piatetski-Shapiro, and J. Shalika. Conducteur des représentations du groupe linéaire. Math. Ann., 256(2):199-214, 1981.
[5] Nadir Matringe. Essential Whittaker functions for \(G L(n)\). Doc. Math., 18:1191-1214, 2013.
[6] Philippe Michel and Akshay Venkatesh. The subconvexity problem for \(\mathrm{GL}_{2}\). Publ. Math. Inst. Hautes Études Sci., (111):171-271, 2010.
[7] Peter Sarnak. Fourth moments of Grössencharakteren zeta functions. Comm. Pure Appl. Math., 38(2):167-178, 1985.

\section*{B. 3 Question 3: Lauren Williams}

Authors: Houcine Ben Dali; Lauren Kiyomi Williams
Title: A probabilistic interpretation for interpolation Macdonald polynomials
The following problem and solution have since appeared as part of [4].

The problem Let \(\lambda=\left(\lambda_{1}>\cdots>\lambda_{n} \geq 0\right)\) be a partition with distinct parts. Assume moreover that \(\lambda\) is restricted, in the sense that it has a unique part of size 0 and no part of size 1 . Does there exist a nontrivial Markov chain on \(S_{n}(\lambda)\) whose stationary distribution is given by
\[
\frac{F_{\mu}^{*}\left(x_{1}, \ldots, x_{n} ; q=1, t\right)}{P_{\lambda}^{*}\left(x_{1}, \ldots, x_{n} ; q=1, t\right)} \text { for } \mu \in S_{n}(\lambda)
\]
where \(F_{\mu}^{*}\left(x_{1}, \ldots, x_{n} ; q, t\right)\) and \(P_{\lambda}^{*}\left(x_{1}, \ldots, x_{n} ; q, t\right)\) are the interpolation ASEP polynomial and interpolation Macdonald polynomial, respectively? If so, prove that the Markov chain you construct has the desired stationary distribution. By "nontrivial" we mean that the transition probabilities of the Markov chain should not be described using the polynomials \(F_{\mu}^{*}\left(x_{1}, \ldots, x_{n} ; q, t\right)\).

The solution The answer to the question is yes, as we explain below. For \(1 \leq k \leq n\), we define
\[
\mathfrak{p}_{k}:=\frac{t^{-n+1}(1-t)}{x_{k}-t^{-n+2}} \in \mathbb{Q}\left(t, x_{1}, \ldots, x_{n}\right) \quad \text { and } \quad \mathfrak{q}_{k}:=\frac{(1-t) x_{k}}{x_{k}-t^{-n+2}} \in \mathbb{Q}\left(t, x_{1}, \ldots, x_{n}\right)
\]

If \(0<t<1\) and \(x_{i}>t^{-n+1}\) for \(1 \leq i \leq n\), then \(\mathfrak{p}_{k}\) and \(\mathfrak{q}_{k}\) are probabilities.
Definition B.1. Fix a partition \(\lambda=\left(\lambda_{1} \geq \cdots \geq \lambda_{n}\right.\) ) with \(\lambda_{n}=0\). The interpolation \(t\)-Push TASEP with content \(\lambda\) is a Markov chain on \(S_{n}(\lambda)\); we think of its states as configurations of particles on a ring labeled by \(\lambda_{1}, \ldots, \lambda_{n}\), where state \(\eta\) corresponds to having a particle labeled \(\eta_{j}\) at position \(j\). Moreover, there is a bell attached to each particle. The transitions from \(\eta \in S_{n}(\lambda)\) are as follows.
(Step o) The bell at position \(j\) rings with probability
\[
P_{j}=\frac{\prod_{k<j}\left(x_{k}-\frac{1}{t^{n-2}}\right) \prod_{k>j}\left(x_{k}-\frac{1}{t^{n-1}}\right)}{e_{n-1}^{*}(\boldsymbol{x} ; t)}
\]
where \(e_{n-1}^{*}(\boldsymbol{x} ; t)=\sum_{j=1}^{n} \prod_{k<j}\left(x_{k}-\frac{1}{t^{n-2}}\right) \prod_{k>j}\left(x_{k}-\frac{1}{t^{n-1}}\right)\).
(Step 1) The particle at position \(j\), say with label \(a\), is activated, and starts traveling clockwise according to the rules of the \(t\)-Push TASEP. That is, suppose there are \(m\) "weaker" particles in the system, i.e. particles whose labels are less than \(a\), including vacancies (label 0 ). Then with probability \(\frac{t^{k-1}}{[m]_{t}}\) the activated particle will move to the location of the \(k\) th of these weaker particles. If this location contains a particle with positive label, then that particle becomes active, and chooses a weaker particle to displace in the same way. The procedure continues until the active particle arrives at a vacancy.
At the end of this step, position \(j\) is vacant, and we regard this vacancy as a particle labeled \(a:=0\).
(Step 2) The particle labeled \(a:=0\) now goes to position 1 and starts traveling clockwise.
When it gets to site \(k\) for \(1 \leq k \leq j-1\) containing a particle with label \(b \geq 0\), it skips over that site with probability
\(1-\mathfrak{p}_{k}\) if \(b \geq a\), and \(1-\mathfrak{q}_{k}\) if \(b<a\);
otherwise it settles at that site, activating/ displacing the site's particle.
Once it activates a new particle, the old particle settles at site \(k\) and the new active particle continues to travel clockwise towards position \(j\), activating a new particle according to the rule above. The active particle stops once it displaces/activates another particle or arrives at position \(j\), in which case it settles in position \(j\).
We denote the resulting configuration by \(\nu\) and the transition probability by \(\mathbb{P}(\eta, \nu)\).
Moreover, we let \(\mathbb{P}_{\lambda, j}^{(1)}=\mathbb{P}_{j}^{(1)}\) and \(\mathbb{P}_{\lambda, j}^{(2)}=\mathbb{P}_{j}^{(2)}\) denote the transition probabilities associated with (Step 1) and (Step 2), respectively. We then have, for \(\mu, \nu \in S_{n}(\lambda)\),
\[
\mathbb{P}(\mu, \nu)=\sum_{1 \leq j \leq n} P_{j} \sum_{\rho \in S_{n}(\lambda): \rho_{j}=0} \mathbb{P}_{j}^{(1)}(\mu, \rho) \mathbb{P}_{j}^{(2)}(\rho, \nu)
\]

Theorem B.2. In the interpolation \(t\)-Push TASEP with content \(\lambda=\left(\lambda_{1}, \ldots, \lambda_{n}\right)\) and parameters \(\boldsymbol{x}=\left(x_{1}, \ldots, x_{n}\right)\) and \(t\), the stationary probability of \(\mu \in S_{n}(\lambda)\) is given by
\[
\pi_{\lambda}^{*}(\mu)=\frac{F_{\mu}^{*}(\boldsymbol{x} ; 1, t)}{P_{\lambda}^{*}(\boldsymbol{x} ; 1, t)}
\]

The proof Recall the notion of classical two-line queues from [5] and signed two-line queues from [3] together with their weight functions. (Here we specialize \(q=1\).)

Let \(\mathcal{Q}_{\kappa}^{\eta}\) denote the set of classical two-line queues with top row \(\eta=\left(\eta_{1}, \ldots, \eta_{n}\right)\) and bottom row \(\kappa=\left(\kappa_{1}, \ldots, \kappa_{n}\right)\), and let \(a_{\kappa}^{\eta}\) denote the weight generating function of \(\mathcal{Q}_{\kappa}^{\eta}\).
\[
a_{\kappa}^{\eta}=a_{\kappa}^{\eta}(t):=\sum_{Q \in \mathcal{Q}_{\kappa}^{\eta}} \mathrm{wt}_{\mathrm{pair}}(Q)
\]

Let \(\mathcal{G}_{\mu}^{\alpha}\) denote the set of signed two-line queues with top row \(\alpha=\left(\alpha_{1}, \ldots, \alpha_{n}\right)\) and bottom row \(\mu=\left(\mu_{1}, \ldots, \mu_{n}\right)\), and let \(b_{\mu}^{\alpha}\) denote the weight generating function of \(\mathcal{G}_{\mu}^{\alpha}\).
\[
b_{\mu}^{\alpha}=b_{\mu}^{\alpha}(t):=\sum_{Q \in \mathcal{G}_{\mu}^{\alpha}} \mathrm{wt}_{\mathrm{pair}}(Q)
\]

Let \(\operatorname{wt}(Q):=\operatorname{wt}_{\text {pair }}(Q) \operatorname{wt}_{\text {ball }}(Q)\) be the product of the pair weight and the ball weight.
We obtain
\[
\mathrm{wt}_{\alpha} b_{\mu}^{\alpha}=\sum_{Q \in \mathcal{G}_{\mu}^{\alpha}} \mathrm{wt}(Q), \text { where } \mathrm{wt}_{\alpha}:=\prod_{k: \alpha_{k}>0} x_{k} \prod_{k: \alpha_{k}<0} \frac{-1}{t^{n-1}} .
\]

Definition B.3. Given a signed two-line queue \(Q \in \mathcal{G}_{\mu}^{\alpha}\), we associate to it an unsigned version \(\bar{Q}\) obtained by forgetting the signs of the balls in the top row. The composition we read in the bottom row (respectively the top row) of \(\bar{Q}\) is \(\mu\) (respectively \(\|\alpha\|\) ), where
\[
\|\alpha\|=\left(\left|\alpha_{1}\right|, \ldots,\left|\alpha_{n}\right|\right) .
\]

We then define \(\overline{\mathcal{G}}_{\mu}^{\kappa}\) as the set of paired ball systems obtained by applying this operation on \(Q \in \mathcal{G}_{\mu}^{\alpha}\), where \(\alpha \in \mathbb{Z}^{n}\) satisfying \(\|\alpha\|=\kappa\).

This leads us to define the following weights. Fix \(\bar{Q} \in \overline{\mathcal{G}}_{\mu}^{\kappa}\) :
- A nontrivial pairing \(p\) in \(\bar{Q}\) has the weight
\[
\operatorname{wt}(p)=(1-t) t^{\operatorname{sip}(p)} .
\]
- Let \(B\) be a ball labeled \(a>0\) in column \(k\) and such that the ball below is labeled \(b\) (If \(B\) has a vacancy below it, we take \(b=0\).) We define the weight of \(B\) by:
\[
\operatorname{wt}(B):= \begin{cases}x_{k}-\frac{1}{t^{n-1}} & \text { if } b=a \\ x_{k} & \text { if } b>a \\ \frac{1}{t^{n-1}} & \text { if } b<a\end{cases}
\]

The weight of \(\bar{Q}\) is defined by
\[
\mathrm{wt}(\bar{Q}):=\prod_{B \text { in the top row }} \mathrm{wt}(B) \prod_{p \text { nontrivial pairing }} \mathrm{wt}(p) .
\]

We then have the following lemma.
Lemma B.4. Fix a partition \(\lambda\) with distinct parts and two compositions \(\kappa, \mu \in S_{n}(\lambda)\). Let \(\bar{Q} \in \overline{\mathcal{G}}_{\mu}^{\kappa}\). Then
\[
\mathrm{wt}(\bar{Q})=\sum_{Q} \mathrm{wt}(Q)
\]
where the sum is taken over all signed two-line queues \(Q\) from which \(\bar{Q}\) is obtained by forgetting signs.

Proof. We consider all the possible ways of "adding signs" to the balls in the top row of \(\bar{Q}\) to obtain a signed two-line queue. Fix such a ball \(B\) labeled \(a>0\) :
- if \(B\) has below it a vacancy or a ball labeled \(b<a\), then we must assign a \(-\operatorname{sign}\) to \(B\).
- if \(B\) has a ball labeled \(b>a\) below it, then we must assign a \(+\operatorname{sign}\) to \(B\).
- if \(B\) has a ball labeled \(b=a\) below it, then we can give \(B \mathrm{a}+\) or - sign.

We then check that the possible signs for each ball \(B\) is consistent with the choice of weights in Equation (B.6). In particular, one notices that when a ball \(B\) is given a - sign, the ball weight should be multiplied by -1 when we go from \(\bar{Q}\) to \(Q\), but the weight of the pairing connected to \(B\) is also multiplied by -1 .

Given \(\kappa \in S_{n}(\nu)\), we define \(c_{\nu}^{\kappa}\) by
\[
c_{\nu}^{\kappa}:=\sum_{\alpha:\|\alpha\|=\kappa} \mathrm{wt}_{\alpha} b_{\nu}^{\alpha}
\]

We get the following corollary obtained by combining Equation (B.4) and Lemma B. 4.
Lemma B.5. Fix \(\lambda\) a partition with distinct parts, and \(\kappa, \mu \in S_{n}(\lambda)\). Then
\[
c_{\mu}^{\kappa}=\sum_{\bar{Q} \in \overline{\mathcal{G}}_{\mu}^{\kappa}} \mathrm{wt}(\bar{Q})
\]

Since \(\lambda\) has distinct parts, \(\overline{\mathcal{G}}_{\nu}^{\kappa}\) is either empty or contains exactly one element.
Fix a weakly order-preserving function \(\phi: \mathbb{N} \rightarrow \mathbb{N}\). Fix two partitions \(\lambda\) and \(\kappa\) such that \(\phi(\lambda)=\kappa\). For \(\eta \in S_{n}(\kappa)\), define
\[
G_{\eta}^{*}(\boldsymbol{x} ; t):=\sum_{\rho \in S_{n}(\lambda): \phi(\rho)=\eta} F_{\rho}^{*}(\boldsymbol{x} ; 1, t)
\]

Let \(G_{\eta}\) be the top homogeneous part of \(G_{\eta}^{*}\).
The following is an analogue of [2, Theorem 4.18], and can be proved in essentially the same way, using interpolation analogues of results from [1].

Theorem B.6. Fix \(\lambda\) and \(\kappa\) as above. For all \(\eta \in S_{n}(\kappa)\), we have at \(q=1\) that
\[
\frac{G_{\eta}^{*}(\boldsymbol{x} ; t)}{P_{\lambda}^{*}(\boldsymbol{x} ; 1, t)}=\frac{F_{\eta}^{*}(\boldsymbol{x} ; 1, t)}{P_{\kappa}^{*}(\boldsymbol{x} ; 1, t)}
\]

Given a composition \(\rho\), let \(\rho^{-}:=\left(\rho_{1}^{-}, \ldots, \rho_{n}^{-}\right)\), where \(\rho_{i}^{-}=\max \left(\rho_{i}-1,0\right)\).
Corollary B.7. Consider a composition \(\rho\) with \(\rho_{i} \neq 1\) for any \(1 \leq i \leq n\). Let \(k\) be the number of non-zero parts of \(\rho\). Set \(\eta=\rho^{-}\). We then have at \(q=1\),
\[
F_{\rho}^{*}(\boldsymbol{x} ; 1, t)=F_{\eta}^{*}(\boldsymbol{x} ; 1, t) \cdot e_{k}^{*}(\boldsymbol{x} ; t)
\]

Proof. Let \(\lambda\) and \(\kappa\) be the two partitions obtained by reordering \(\rho\) and \(\eta\), respectively. Consider the weakly order-preserving function \(\phi: i \mapsto \max (i-1,0)\). We then have \(\phi(\rho)=\eta\). Since \(\lambda\) does not have parts of size 1 , and \(\phi\) is bijective from \(\{0,2,3, \ldots\}\) to \(\{0,1,2, \ldots\}\), then \(\rho\) is the unique composition in \(S_{n}(\lambda)\) such that \(\phi(\rho)=\eta\) and we have \(G_{\eta}^{*}=F_{\rho}^{*}\). It follows then from Theorem B.6 that
\[
\frac{F_{\rho}^{*}(\boldsymbol{x} ; 1, t)}{P_{\lambda}^{*}(\boldsymbol{x} ; 1, t)}=\frac{F_{\eta}^{*}(\boldsymbol{x} ; 1, t)}{P_{\kappa}^{*}(\boldsymbol{x} ; 1, t)}
\]

We now recall that at \(q=1\), we have from [6, 3] that
\[
P_{\lambda}^{*}\left(x_{1}, \ldots, x_{n} ; 1, t\right)=\prod_{1 \leq i \leq \lambda_{1}} P_{\lambda_{i}^{\prime}}^{*}\left(x_{1}, \ldots, x_{n} ; 1, t\right)=\prod_{1 \leq i \leq \lambda_{1}} e_{\lambda_{i}^{\prime}}^{*}\left(x_{1}, \ldots, x_{n} ; t\right),
\]
where \(\lambda^{\prime}\) is the partition conjugate to \(\lambda\). Using this plus the fact that \(\kappa\) is obtained from \(\lambda\) by removing the largest column (of size \(k\) ), we get that
\[
\frac{P_{\lambda}^{*}(\boldsymbol{x} ; 1, t)}{P_{\kappa}^{*}(\boldsymbol{x} ; 1, t)}=e_{k}^{*}(\boldsymbol{x} ; t)
\]
which implies that \(F_{\rho}^{*}(\boldsymbol{x} ; 1, t)=F_{\eta}^{*}(\boldsymbol{x} ; 1, t) \cdot e_{k}^{*}(\boldsymbol{x} ; t)\).
Proposition B.8. Fix \(\rho, \nu \in S_{n}(\lambda)\), and let \(j\) be the index such that \(\rho_{j}=0\). We have
\[
\mathbb{P}_{j}^{(2)}(\rho, \nu)=\frac{c_{\nu}^{\rho}}{\prod_{k<j}\left(x_{k}-\frac{1}{t^{n-2}}\right) \prod_{k>j}\left(x_{k}-\frac{1}{t^{n-1}}\right)}
\]
or equivalently,
\[
P_{j} \cdot \mathbb{P}_{j}^{(2)}(\rho, \nu)=\frac{c_{\nu}^{\rho}}{e_{n-1}^{*}}
\]
where \(c_{\nu}^{\rho}\) is the coefficient from Equation (B.7) i.e. the generating function for the set \(\overline{\mathcal{G}}_{\nu}^{\rho}\).
The idea of the proof below is that a signed two-line queue encodes Step 2 of the interpolation \(t\)-Push TASEP.

Proof. Note that (Step 2) of Definition B.1 is encoded by an element of a set \(\overline{\mathcal{G}}_{\nu}^{\rho}\) (see Definition B.3).
Indeed, the transition in (Step 2) from the configuration \(\rho\) to the configuration \(\nu\) is possible if and only there is an element \(\bar{Q}\) in \(\overline{\mathcal{G}}_{\nu}^{\rho}\) (recall that this set contains at most one element). More precisely, a particle labeled \(a>0\) which moved from position \(k \in \llbracket n \rrbracket\) to a position \(k^{\prime}\), corresponds to a non trivial pairing in \(\bar{Q}\) connecting a ball labeled \(a\) in column \(k\) of the top row to a ball labeled \(a\) in column \(k^{\prime}\) of the bottom row. Particles which do not move correspond to trivial pairings.

We now claim that \(\operatorname{wt}(\bar{Q})\) divided by \(D:=\prod_{k<j}\left(x_{k}-\frac{1}{t^{n-2}}\right) \prod_{k>j}\left(x_{k}-\frac{1}{t^{n-1}}\right)\) gives \(\mathbb{P}_{j}^{(2)}(\rho, \nu)\). We will prove the claim below by showing that each ball or pairing weight in \(\mathrm{wt}(\bar{Q})\), divided by one of the factors in \(D\), equals one of the skipping/ displacement probabilities from Item (Step 2)
(whose product is \(\mathbb{P}_{j}^{(2)}(\rho, \nu)\) ). Note that in what follows, instead of associating the weight \((1-t) t^{\text {skip }(p)}\) to each nontrivial pairing, we will associate \((1-t)\) to the top ball in each nontrivial pairing, and a factor of \(t\) to each skipped ball.
- Each ball in column \(k>j\) of \(\bar{Q}\) is necessarily trivially paired, since no ball in position \(k>j\) get skipped or displaced in (Step 2). In \(\bar{Q}\) this ball gets weight \(x_{k}-\frac{1}{t^{n-1}}\); when we divide this weight by the \(k\) th factor of \(D\), we get 1 , which corresponds to the fact that balls in position \(k>j\) do not contribute to \(\mathbb{P}_{j}^{(2)}(\rho, \nu)\).
- A ball in \(\bar{Q}\) labeled \(b\) in column \(k<j\) which is trivially paired, and which is not skipped by a ball \(a>b\), also has weight \(x_{k}-\frac{1}{t^{n-1}}\). When we divide this weight by the \(k\) th factor of \(D\), we get \(1-\mathfrak{p}_{k}\) (see ( \(\left.\overline{\text { B.1 }}\right)\) ). This is what we desired, because such a trivial pairing in \(\bar{Q}\) corresponds to a particle labeled \(b\) which is skipped over by a particle with a smaller label, and hence contributes \(1-\mathfrak{p}_{k}\) to \(\mathbb{P}_{j}^{(2)}(\rho, \nu)\).
- A ball in \(\bar{Q}\) labeled \(b\) in column \(k<j\) which is trivially paired, and which is skipped by a ball \(a>b\), gets a weight \(t\left(x_{k}-\frac{1}{t^{n-1}}\right)\). When we divide this weight by the \(k\) th factor of \(D\), we get \(1-\mathfrak{q}_{k}\) (see (B.1)). This is what we desired, because such a trivial pairing corresponds to a particle labeled \(b\) skipped over by a particle with a larger label, and hence contributes \(1-\mathfrak{q}_{k}\) to \(\mathbb{P}_{j}^{(2)}(\rho, \nu)\).
- A ball labeled \(b\) in the top row of \(\bar{Q}\) in column \(k<j\) which has a ball labeled \(a<b\) below it gets a weight \((1-t) \frac{1}{t^{n-1}}\) (the factor \((1-t)\) is the nontrivial pairing weight). When we divide this weight by the \(k\) th factor of \(D\), we get \(\mathfrak{p}_{k}\). This is what we desired, because this pairing corresponds to a particle labeled \(b\) being displaced by a particle with a smaller label, and hence contributing \(\mathfrak{p}_{k}\) to \(\mathbb{P}_{j}^{(2)}(\rho, \nu)\).
- A ball labeled \(b\) in the top row of \(\bar{Q}\) in column \(k<j\) which has a ball labeled \(a>b\) below it gets a weight \((1-t) x_{k}\) (the factor \((1-t)\) is the nontrivial pairing weight). When we divide this weight by the \(k\) th factor of \(D\), we get \(\mathfrak{q}_{k}\). This is what we desired, because this pairing corresponds to a particle labeled \(b\) being displaced by a particle with a larger label, and hence contributing \(\mathfrak{q}_{k}\) to \(\mathbb{P}_{j}^{(2)}(\rho, \nu)\).

Proposition B.9. If \(\lambda\) is restricted, and \(\mu, \nu \in S_{n}(\lambda)\), then
\[
\mathbb{P}(\mu, \nu)=\sum_{\rho \in S_{n}(\lambda)} \frac{a_{\rho}^{\mu} c_{\nu}^{\rho}}{e_{n-1}^{*}}
\]

Proof. Combining [2, Lemma 5.4] and Proposition B.8, we get
\[
\begin{aligned}
\mathbb{P}(\mu, \nu) & =\sum_{1 \leq j \leq n} P_{j} \sum_{\rho \in S_{n}(\lambda): \rho_{j}=0} \mathbb{P}_{j}^{(1)}(\mu, \rho) \mathbb{P}_{j}^{(2)}(\rho, \nu) \\
& =\sum_{1 \leq j \leq n} \sum_{\rho \in S_{n}(\lambda): \rho_{j}=0} \frac{a_{\rho}^{\mu} c_{\nu}^{\rho}}{e_{n-1}^{*}} \\
& =\sum_{\rho \in S_{n}(\lambda)} \frac{a_{\rho}^{\mu} c_{\nu}^{\rho}}{e_{n-1}^{*}} .
\end{aligned}
\]

Proof of Theorem B.2. Fix a restricted partition \(\lambda\).
Let \(\nu \in S_{n}(\lambda)\). From [3, Theorem 1.15 and Lemma 5.6], we have
\[
F_{\nu}^{*}(\boldsymbol{x} ; 1, t)=\sum_{\eta \in \mathbb{N}^{n}} F_{\nu}^{* \eta}(\boldsymbol{x} ; t) F_{\eta^{-}}^{*}(\boldsymbol{x} ; 1, t)
\]
where
\[
F_{\nu}^{* \eta}(\boldsymbol{x} ; t):=\sum_{\alpha \in \mathbb{Z}^{n}} b_{\nu}^{\alpha} \mathrm{wt}_{\alpha} a_{\|\alpha\|}^{\eta}=\sum_{\kappa \in \mathbb{N}^{n}} a_{\kappa}^{\eta} c_{\nu}^{\kappa}
\]

But we know from
Corollary B. 7 that
\[
F_{\eta^{-}}^{*}(\boldsymbol{x} ; 1, t)=\frac{F_{\eta}^{*}(\boldsymbol{x} ; 1, t)}{e_{n-1}^{*}(\boldsymbol{x} ; t)}
\]
we use here the fact that \(\eta\) has a unique part of size 0 .
Hence
\[
F_{\nu}^{*}(\boldsymbol{x} ; 1, t)=\sum_{\eta \in \mathbb{N}^{n}} F_{\eta}^{*}(\boldsymbol{x} ; 1, t) \sum_{\kappa \in \mathbb{N}^{n}} \frac{a_{\kappa}^{\eta} c_{\nu}^{\kappa}}{e_{n-1}^{*}(\boldsymbol{x} ; t)},
\]
which can be rewritten using the transition probabilities of the interpolation \(t\)-Push TASEP (Proposition B.9) we get
\[
F_{\nu}^{*}(\boldsymbol{x} ; 1, t)=\sum_{\eta \in \mathbb{N}^{n}} F_{\eta}^{*}(\boldsymbol{x} ; 1, t) \mathbb{P}(\eta, \nu) .
\]

This proves that \(F_{\mu}^{*}(\boldsymbol{x} ; 1, t)\) are proportional to the stationary distribution of the interpolation \(t\)-Push TASEP \(\pi_{\lambda}^{*}(\mu)\). Finally, we use the fact that \(P_{\lambda}^{*}=\sum_{\mu \in S_{n}(\lambda)} F_{\mu}^{*}\) to deduce that \(\frac{F_{\mu}^{*}(x ; 1, t)}{P_{\lambda}^{*}(x ; 1, t)}=\pi_{\lambda}^{*}(\mu)\).

\section*{B.3.1 References}
[1] P. Alexandersson and M. Sawhney. Properties of non-symmetric Macdonald polynomials at \(q=1\) and \(q=0\). Annals of Combinatorics, 23(2):219-239, 2019. doi:10.1007/s00026-019-00432-Z.
[2] A. Ayyer, J. Martin, and L. Williams. The inhomogeneous \(t\)-PushTASEP and Macdonald polynomials at \(q=1\). Annales de l'Institut Henri Poincaré D, 2025.
[3] H. Ben Dali and L. Williams. A combinatorial formula for interpolation Macdonald polynomials. Preprint, arXiv:2510.02587, 2025.
[4] H. Ben Dali and L. Williams. A probabilistic interpretation for interpolation Macdonald polynomials. Preprint, arXiv:2602.13492v1, 2026.
[5] S. Corteel, O. Mandelshtam, and L. Williams. From multiline queues to Macdonald polynomials via the exclusion process. American Journal of Mathematics, 144(2):395-436, 2022. doi:10.1353/ajm.2022.0007.
[6] M. Dołęga. Strong factorization property of Macdonald polynomials and higher-order Macdonald's positivity conjecture. Journal of Algebraic Combinatorics, 46(1):135-163, 2017. doi:10.1007/s10801-017-0750-X.
[7] F. Knop. Symmetric and non-symmetric quantum Capelli polynomials. Commentarii Mathematici Helvetici, 72(1):84-100, 1997. doi:10.4171/CMH/72.1.7.
[8] S. Sahi. Interpolation, integrality, and a generalization of Macdonald's polynomials. International Mathematics Research Notices, 1996(10):457-471, 1996.

\section*{B. 4 Question 4: Nikhil Srivastava}

Authors: Jorge Garza Vargas, Nikhil Srivastava, and Zack Stier
Title: The finite free Stam inequality
Let \(\boxplus_{n}\) and \(\Phi_{n}(\cdot)\) be defined as in the problem statement. In this note we prove the following result, which was conjectured by D. Shlyakhtenko.

Theorem B.1. Let \(p(x)\) and \(q(x)\) be any two monic real-rooted polynomials of degree \(n\). Then
\[
\frac{1}{\Phi_{n}\left(p \boxplus_{n} q\right)} \geq \frac{1}{\Phi_{n}(p)}+\frac{1}{\Phi_{n}(q)}
\]

\section*{Notation and preliminaries}

Polynomials and the finite free convolution Given a polynomial \(p(x)\) of degree \(n\) we say that \(\alpha=\left(\alpha_{1}, \ldots, \alpha_{n}\right)\) is a vector of roots for \(p(x)\) if the \(\alpha_{i}\) are the roots of \(p(x)\). We will say that \(\alpha\) is ordered if \(\alpha_{1} \geq \cdots \geq \alpha_{n}\). Recall that for monic polynomials \(p(x)\) and \(q(x), p(x) \boxplus_{n} q(x)\) may be expressed as:
\[
p(x) \boxplus_{n} q(x)=\sum_{\pi \in S_{n}} \prod_{i=1}^{n}\left(x-\alpha_{i}-\beta_{\pi(i)}\right),
\]
where \(\alpha\) and \(\beta\) are vectors of roots for \(p(x)\) and \(q(x)\), respectively, and \(S_{n}\) is the symmetric group on \(n\) elements (see Theorem 2.11 of [1] for a proof). Walsh [2] proved that if \(p(x)\) and \(q(x)\) are real-rooted, then so is \(p(x) \boxplus_{n} q(x)\). Therefore, the finite free convolution induces a map
\[
\Omega_{\boxplus_{n}}: \mathbb{R}^{n} \times \mathbb{R}^{n} \rightarrow \mathbb{R}^{n},
\]
where if \(\alpha\) and \(\beta\) are vectors of roots for \(p(x)\) and \(q(x)\), then \(\Omega_{\boxplus_{n}}(\alpha, \beta)\) is defined to be the ordered vector of roots for \(p(x) \boxplus_{n} q(x)\).

Other than the fact that \(\boxplus_{n}\) preserves real-rootedness, our proof will crucially exploit each of the following well-known properties of the finite free convolution. In what follows we will use \(\mathbb{1}_{n}\) to denote the all-ones vector of dimension \(n\). We will use the notation
\[
m_{k}(\alpha):=\frac{1}{n} \sum_{i=1}^{n} \alpha_{i}^{k} \quad \text { and } \quad \operatorname{Var}(\alpha):=m_{2}(\alpha)-m_{1}(\alpha)^{2} .
\]

Proposition B. 1 (Properties of \(\boxplus_{n}\) ). If \(\alpha, \beta \in \mathbb{R}^{n}\) and \(\gamma=\Omega_{\boxplus_{n}}(\alpha, \beta)\), then:
i) (Additivity) \(m_{1}(\gamma)=m_{1}(\alpha)+m_{1}(\beta)\) and \(\operatorname{Var}(\gamma)=\operatorname{Var}(\alpha)+\operatorname{Var}(\beta)\).
ii) (Commutation with translation) For all \(t \in \mathbb{R}, \Omega_{\boxplus_{n}}\left(\alpha+t \mathbb{1}_{n}, \beta\right)=\gamma+t \mathbb{1}_{n}\) and \(\Omega_{\boxplus_{n}}(\alpha, \beta+ \left.t \mathbb{1}_{n}\right)=\gamma+t \mathbb{1}_{n}\).

Proof. (i) Follows from the definition of \(p \boxplus_{n} q\) in terms of the coefficients of \(p\) and \(q\) and the Newton identities. (ii) Follows from (B.1).

The heat flow and the finite free Fisher information Given a vector of roots \(\alpha \in \mathbb{R}^{n}\) we will define the its finite free score vector \(\mathscr{J}_{n}(\alpha) \in(\mathbb{R} \cup\{\infty\})^{n}\) as
\[
\mathscr{J}_{n}(\alpha):=\left(\sum_{j: j \neq i} \frac{1}{\alpha_{i}-\alpha_{j}}\right)_{i=1}^{n} .
\]

Given a real-rooted polynomial \(p(x)\) with vector of roots \(\alpha\), define its finite free Fisher information as
\[
\Phi_{n}(p):=\left\|\mathscr{J}_{n}(\alpha)\right\|^{2} .
\]

The following fact will allow us to write the finite free Fisher information of the polynomial \(p(x)\) in terms of the dynamics of its roots under the reverse heat flow. It was shown to us by D. Shlyakhtenko.

Lemma B. 1 (Score vectors as derivatives). Assume \(p(x)\) has simple roots. Let \(p_{t}(x):= \exp \left(-\frac{t}{2} \partial_{x}^{2}\right) p(x)\) and let \(\alpha(t)=\left(\alpha_{1}(t), \ldots, \alpha_{n}(t)\right)\) be the ordered vector of roots of \(p_{t}(x)\). Then
\[
\alpha_{i}^{\prime}(0)=\sum_{j: j \neq i} \frac{1}{\alpha_{i}-\alpha_{j}},
\]
and in particular \(\alpha^{\prime}(0)=\mathscr{J}_{n}(\alpha)\).
Proof. Since the \(\alpha_{i}(t)\) are continuous in \(t\), the roots remain simple in a neighborhood of \(t=0\). Implicitly differentiating the expression
\[
p\left(\alpha_{i}(t)\right)-t p^{\prime \prime}\left(\alpha_{i}(t)\right) / 2+t^{2} R\left(\alpha_{i}(t), t\right)=0
\]
(where \(R(x, t)\) is a polynomial) at \(t=0\) one obtains
\[
\alpha_{i}^{\prime}(0)=\frac{1}{2} \frac{p^{\prime \prime}\left(\alpha_{i}\right)}{p^{\prime}\left(\alpha_{i}\right)},
\]
which is equal to the advertised expression.

Proof of Stam's inequality We now prove Theorem B.1. The following Lemma allows us to restrict attention to the case when \(p, q\), and \(p \boxplus_{n} q\) all have simple roots.

Lemma B. 2 (Approximation by Simple Rooted Polynomials). Let \(\epsilon>0\) and define the differential operator \(T_{\epsilon}:=(1-\epsilon \cdot d / d x)^{n}\). If \(p(x)\) is a monic real-rooted polynomial of degree \(n\), then
i) \(\left(T_{\epsilon} p\right)(x)\) is monic and real-rooted of degree \(n\) with simple roots.
ii) \(\Phi_{n}\left(T_{\epsilon} p\right) \rightarrow \Phi_{n}(p)\) as \(\epsilon \rightarrow 0\).
iii) \(\left(T_{\epsilon} p\right) \boxplus_{n}\left(T_{\epsilon} q\right)=T_{\epsilon}^{2}\left(p \boxplus_{n} q\right)\).

Proof. (i) was shown in [3]. (ii) is because \(\Phi_{n}\) is continuous in the roots of \(p\), which are continuous in \(\epsilon\). (iii) follows because \(\boxplus_{n}\) commutes with differential operators (see e.g. [1].)

Thus, establishing Theorem B.1 for the simple case implies the general case by using (iii) above and taking \(\epsilon \rightarrow 0\). In what follows, \(p(x)\) and \(q(x)\) are monic real-rooted polynomials, \(\alpha\) and \(\beta\) are vectors of roots for \(p(x)\) and \(q(x), \gamma:=\Omega_{\boxplus_{n}}(\alpha, \beta)\), and \(\alpha, \beta, \gamma\) all have distinct entries, implying that they are smooth functions of the coefficients of the corresponding polynomials. Let \(J_{\boxplus_{n}}\) denote the Jacobian of \(\Omega_{\boxplus_{n}}\) at the point \((\alpha, \beta)\).

Our proof can be separated into three steps. The second step is the most substantial one and we will defer its detailed discussion to Section B. 4.

Step 1 (Jacobians and score vectors). We first note that the following relation between score vectors holds.

Observation B. 2 (Relating score vectors). Using the above notation, for any \(a, b \geq 0\)
\[
J_{\boxplus_{n}}\left(a \mathscr{J}_{n}(\alpha), b \mathscr{J}_{n}(\beta)\right)=(a+b) \mathscr{J}_{n}(\gamma) .
\]

Proof. For every \(t \geq 0\) let \(p_{t}(x)=\exp \left(-\frac{t}{2} \partial_{x}^{2}\right) p(x)\), let \(\alpha(t)\) be the ordered vector of roots of \(p_{t}\), and define \(q_{t}, r_{t}\) and \(\beta(t), \gamma(t)\) in an analogous way. Since the finite free convolution commutes with any differential operator, it follows that
\[
r_{(a+b) t}=p_{a t} \boxplus_{n} q_{b t}
\]

Hence \(\gamma((a+b) t)=\Omega_{\boxplus_{n}}\left(\alpha_{a t}, \beta_{b t}\right)\) for every \(t\). So, if we differentiate this relation with respect to \(t\), using the chain rule for the right-hand side, we get
\[
(a+b) \gamma^{\prime}(0)=J_{\boxplus_{n}}\binom{a \cdot \alpha^{\prime}(0)}{b \cdot \beta^{\prime}(0)}
\]

A direct application of Lemma B. 1 concludes the proof.
Step 2 (Understanding the Jacobian). The substance of our proof lies in understanding \(J_{\boxplus_{n}}\). In particular, we will show the following.

Proposition B.2. If \(u, v \in \mathbb{R}^{n}\) are orthogonal to \(\mathbb{1}_{n}\) then
\[
\left\|J_{\boxplus_{n}}(u, v)\right\|^{2} \leq\|u\|^{2}+\|v\|^{2}
\]

This proposition will be proven in Section B.4, for now we show how it is used.
Step 3 (Proof of Theorem B. 1 à la Blachman). With Observation B. 2 and Proposition B. 2 in hand we can conclude the proof using the same argument that Blachman used in [4].

Proof of Theorem B.1. First note that
\[
\sum_{i=1}^{n} \sum_{j: j \neq i} \frac{1}{\alpha_{i}-\alpha_{j}}=0
\]
since each term in the sum appears once with a plus and once with a minus. Therefore \(\mathscr{J}_{n}(\alpha)\) is orthogonal to \(\mathbb{1}_{n}\) and, arguing analogously, \(\mathscr{J}_{n}(\beta)\) is orthogonal to \(\mathbb{1}_{n}\). So, Proposition B. 2 implies
\[
\left\|J_{\boxplus_{n}}\left(a \mathscr{J}_{n}(\alpha), b \mathscr{J}_{n}(\beta)\right)\right\|^{2} \leq a^{2}\left\|\mathscr{J}_{n}(\alpha)\right\|^{2}+b^{2}\left\|\mathscr{J}_{n}(\beta)\right\|^{2}
\]

Combining this with Observation B. 2 yields
\[
(a+b)^{2}\left\|\mathscr{J}_{n}(\gamma)\right\|^{2} \leq a^{2}\left\|\mathscr{J}_{n}(\alpha)\right\|^{2}+b^{2}\left\|\mathscr{J}_{n}(\beta)\right\|^{2}
\]

Now, by choosing \(a=\frac{1}{\left\|\mathscr{L}_{n}(\alpha)\right\|^{2}}\) and \(b=\frac{1}{\left\|\mathscr{L}_{n}(\beta)\right\|^{2}}\), the above inequality turns into
\[
\left(\frac{1}{\left\|\mathscr{J}_{n}(\alpha)\right\|^{2}}+\frac{1}{\left\|\mathscr{J}_{n}(\beta)\right\|^{2}}\right)^{2}\left\|\mathscr{J}_{n}(\gamma)\right\|^{2} \leq \frac{1}{\left\|\mathscr{J}_{n}(\alpha)\right\|^{2}}+\frac{1}{\left\|\mathscr{J}_{n}(\beta)\right\|^{2}},
\]
which after simple algebraic manipulations can be turned into the inequality claimed in Theorem B.1.

Understanding \(J_{\boxplus_{n}}\) Let \(\left(\Omega_{\boxplus_{n}, 1}, \ldots, \Omega_{\boxplus_{n}, n}\right)\) be the coordinate functions of \(\Omega_{\boxplus_{n}}\), that is \(\gamma_{i}= \Omega_{\boxplus_{n}, i}(\alpha, \beta)\). The starting point of our approach to proving Proposition B. 2 is the observation that the matrix \(J_{\boxplus_{n}} J_{\boxplus_{n}}^{*}\) is related to the Hessians of the functions \(\Omega_{\boxplus_{n}, i}\). It will be helpful to introduce the notation
\[
H_{\boxplus_{n}}^{(i)}:=\operatorname{Hess}_{\Omega_{\mathbb{m}_{n}, i}} .
\]

For this discussion it will prove useful to define the \((2 n-2)\)-dimensional subspace
\[
\mathcal{V}=\left\{(u, v) \in \mathbb{R}^{n} \times \mathbb{R}^{n}: u^{*} \mathbb{1}_{n}=v^{*} \mathbb{1}_{n}=0\right\}
\]

And, given \(w \in \mathbb{R}^{n} \times \mathbb{R}^{n}\) and \(f: \mathbb{R}^{n} \times \mathbb{R}^{n} \rightarrow \mathbb{R}^{n}\) we will use \(D_{w} f\) to denote the directional derivative of \(f\) in the direction of \(w\), that is \(D_{w}=\sum_{i} w_{i} \partial_{i}\).

Lemma B. 3 (The Hessian of \(\Omega_{\boxplus_{n}}\) ). Using the above notation
\[
w^{*} J_{\boxplus_{n}} J_{\boxplus_{n}}^{*} w=w^{*}\left(I_{n} \oplus I_{n}-\sum_{i=1}^{n} \gamma_{i} H_{\boxplus_{n}}^{(i)}\right) w, \quad \forall w \in \mathcal{V}
\]

Proof. Fix \(w=(u, v) \in \mathcal{V}\) and define
\[
\alpha(t):=\alpha+t u, \quad \beta(t):=\beta+t v, \quad \text { and } \quad \gamma(t):=\Omega_{\boxplus_{n}}(\alpha(t), \beta(t)),
\]
and note that the variance additivity from Proposition B.1 |i) implies that
\[
m_{2}(\gamma(t))-m_{1}(\gamma(t))^{2}=m_{2}(\alpha(t))+m_{2}(\beta(t))-\left(m_{1}(\alpha(t))^{2}+m_{1}(\beta(t))^{2}\right)
\]

Now, the fact that \((u, v) \in \mathcal{V}\) implies that the means \(m_{1}(\alpha(t))\) and \(m_{1}(\beta(t))\) are a constant function of \(t\) and therefore, again by Proposition B.1 i), the mean \(m_{1}(\gamma(t))\) is also a constant function of \(t\). So, differentiating the above equation twice with respect to \(t\) we get
\[
\left.\partial_{t}^{2} m_{2}(\gamma(t))\right|_{t=0}=\left.\partial_{t}^{2}\left(m_{2}(\alpha(t))+m_{2}(\beta(t))\right)\right|_{t=0}
\]

Now we inspect both sides of the above equation. First
\[
\left.n \partial_{t}^{2} m_{2}(\gamma(t))\right|_{t=0}=\sum_{i=1}^{n} D_{w}^{2}\left(\gamma_{i}^{2}\right)
\]
\[
\begin{aligned}
& =2 \sum_{i=1}^{n}\left(\left(D_{w} \gamma_{i}\right)^{2}+\gamma_{i} D_{w}^{2} \gamma_{i}\right) \\
& =2\left(w^{*} J_{\boxplus_{n}} J_{\boxplus_{n}}^{*} w+\sum_{i=1}^{n} \gamma_{i} w^{*} H_{\boxplus_{n}}^{(i)} w\right)
\end{aligned}
\]

Second
\[
\begin{aligned}
n \partial_{t}^{2}\left(m_{2}(\alpha(t))+m_{2}(\beta(t))\right) & =\partial_{t}^{2}\left((\alpha+t u)^{*}(\alpha+t u)+(\beta+t v)^{*}(\beta+t v)\right) \\
& =2\left(u^{*} u+v^{*} v\right) \\
& =2 w^{*} w
\end{aligned}
\]

Finally, plugging ( B.4) and (B.5) back into (B.3) yields
\[
w^{*} J_{\boxplus_{n}} J_{\oplus_{n}}^{*} w+\sum_{i=1}^{n} \gamma_{i} w^{*} H_{\boxplus_{n}}^{(i)} w=w^{*} w
\]
which is equivalent to the advertised result.
We now apply a result of Bauschke et al. [5, Corollary 3.3].
Theorem B. 3 (Bauschke et al.). Let \(f \in \mathbb{R}\left[x_{1}, \ldots, x_{m}\right]\) be a hyperbolic polynomial in the direction \(w \in \mathbb{R}^{m}\) and for every \(a \in \mathbb{R}^{m}\) let \(\lambda_{1}(a) \geq \cdots \geq \lambda_{m}(a)\) be the roots of \(g_{a}(t):=f(a+t w)\). Then, for every \(k=1, \ldots, m\), the function \(\sigma_{k}(a):=\sum_{i=1}^{k} \lambda_{i}(a)\) is convex in \(a\).

In our context this implies the following.
Corollary B.1. For any real numbers \(c_{1} \geq \cdots \geq c_{n}\), the matrix \(\sum_{i=1}^{n} c_{i} H_{\boxplus_{n}}^{(i)}\) is PSD.
Proof. Define the multivariate polynomial
\[
f\left(x, a_{1}, \ldots, a_{n}, b_{1}, \ldots, b_{n}\right):=\sum_{\pi \in S_{n}} \prod_{i=1}^{n}\left(x-a_{i}-b_{\pi(i)}\right) .
\]

Since the above polynomial is homogeneous and the finite free convolution preserves real rootedness, \(f\) is hyperbolic in the direction \(e_{1}=(1,0 \cdots, 0)\). Now, by Theorem B. 3 the functions
\[
\sigma_{k}(x, a, b)=\sum_{i=1}^{k} \lambda_{i}(x, a, b)
\]
are convex, where \(\lambda_{1}(x, a, b) \geq \cdots \geq \lambda_{n}(x, a, b)\) denote the roots of \(f\left((x, a, b)+t e_{1}\right)\). And, because the \(c_{i}\) are ordered we moreover have that the function
\[
L(x, a, b):=\sum_{i=1}^{n} c_{i} \lambda_{i}(x, a, b)
\]
is convex, as it can be written as a positive linear combination of the \(\sigma_{k}\). It follows that \(\operatorname{Hess}_{L}= \sum_{i=1}^{n} c_{i} \operatorname{Hess}_{\lambda_{i}}\) at any ( \(x, a, b\) ) is PSD. But, on the other hand, when \(x=0, a=\alpha\) and \(b=\beta\), we have that \(\operatorname{Hess}_{\lambda_{i}}=H_{\boxplus_{n}}^{(i)}\), which in turn gives that \(\sum_{i=1}^{n} c_{i} H_{\boxplus_{n}}^{(i)}\) is PSD.

We can now complete the proof of Proposition B.2.
Proof of Proposition B.2. Let \((u, v) \in \mathcal{V}\). Then
\[
\left\|J_{\boxplus_{n}}(u, v)\right\|^{2}=(u, v)^{*} J_{\boxplus_{n}} J_{\boxplus_{n}}^{*}(u, v)=\|u\|^{2}+\|v\|^{2}-\sum_{i=1}^{n} \gamma_{i}(u, v)^{*} H_{\boxplus_{n}}^{(i)}(u, v),
\]
where the last equality follows from Lemma B.3. Now, applying Corollary B.1 with \(c_{i}=\gamma_{i}\) gives that \(\sum_{i=1}^{n} \gamma_{i} H_{\boxplus_{n}}^{(i)}\) is PSD, and hence
\[
\sum_{i=1}^{n} \gamma_{i}(u, v)^{*} H_{\boxplus_{n}}^{(i)}(u, v) \geq 0
\]

The proof follows from putting the two expressions together.

\section*{B.4.1 References}
[1] A. W. Marcus, D. A. Spielman, and N. Srivastava. Finite free convolutions of polynomials. Probab. Theory Related Fields, 182(3):807-848, 2022.
[2] J. L. Walsh. On the location of the roots of certain types of polynomials. Trans. Amer. Math. Soc., 24(3):163-180, 1922.
[3] W. Nuij. A note on hyperbolic polynomials. Math. Scand., 23(1):69-72, 1968.
[4] N. Blachman. The convolution inequality for entropy powers. IEEE Trans. Inform. Theory, 11(2):267-271, 1965.
[5] H. H. Bauschke, O. Güler, A. S. Lewis, and H. S. Sendov. Hyperbolic polynomials and convex analysis. Canad. J. Math., 53(3):470-488, 2001.

\section*{B. 5 Question 5: Andrew J. Blumberg}

Authors: Andrew J. Blumberg; Michael A. Hill; Tyler Lawson
Title: Generalized equivariant slice categories

Indexed slice categories (Excerpt from "Generalized equivariant slice categories", with Mike Hill and Tyler Lawson.)

Transfer and indexing systems We begin with an ahistorical but geodesic summary of transfer systems and indexing systems.

Definition B. 1 ([1], [5]). A transfer system on \(G\) is a partial order we will denote by \(\rightarrow\) on \(\operatorname{Sub}(G)\) satisfying three properties:
1. it refines subgroup inclusion: if \(H \rightarrow K\), then \(H \subseteq K\),
2. it is conjugation invariant: if \(H \rightarrow K\) and \(g \in G\), then \(g H g^{-1} \rightarrow g K g^{-1}\), and
3. it is closed under restriction: if \(H \rightarrow K\) and \(J \subseteq K\), then \(H \cap J \rightarrow J\).

The collection of all transfer systems on \(G\) forms a poset under refinement, and we will use \(\leq\) for the partial order here.

Definition B.2. Let \(\mathcal{O}\) be a transfer system on \(G\). A finite \(H\)-set
\[
T=\coprod_{i} H / K_{i}
\]
is admissible for \(\mathcal{O}\) if for all \(i, K_{i} \rightarrow H\). The collection of admissible \(H\)-sets for \(\mathcal{O}\) will be denoted \(\mathcal{O}(H)\). The collection of all \(\mathcal{O}(H)\) as \(H\) varies gives an indexing system.

The admissible sets of \(\mathcal{O}\) are closely connected to the norms structured by an \(N_{\infty}\) operad; we will usually also abusively denote the operad by \(\mathcal{O}\). Here \(i_{*}^{H}: \mathcal{S} p^{G} \rightarrow \mathcal{S} p^{H}\) denotes the pullback functor along the inclusion \(H \rightarrow G\) and \(N_{H}^{G}: \mathcal{S} p^{H} \rightarrow \mathcal{S} p^{G}\) denotes the Hill-Hopkins-Ravenel norm [3].

Definition B.3. For a finite \(G\)-set \(T\), we define the \(T\)-norm
\[
N^{T}: \mathcal{S} p^{G} \rightarrow \mathcal{S} p^{G}
\]
inductively by the formulas
1. \(N^{G / H}(E)=N_{H}^{G} i_{H}^{*}(E)\), and
2. \(N^{T_{0} \amalg T_{1}}(E)=N^{T_{0}}(E) \otimes N^{T_{1}}(E)\).
\(\mathcal{O}\)-slice filtration We now define the slice filtration relative to an indexing system \(\mathcal{O}\). We are going to use equivariant localization (more specifically, nullification) to construct the relative slice towers. Recall that in the equivariant context, we define local and acylic objects in terms of conditions on the \(G\)-space of maps rather than the non-equivariant space of maps. The acylic objects form an equivariant localizing subcategory. Recall that given a set of objects in \(\mathcal{S} p^{G}\), we define the equivariant localizing subcategory generated by these objects to be the full subcategory of \(S p^{G}\) constructed as the closure under homotopy colimits, retracts, and tensors with orbit spectra.
Definition B.4. If \(\mathcal{O}\) is an indexing system, then let \(\tau_{\geq n}^{\mathcal{O}}\) be the equivariant localizing subcategory of \(\mathcal{S} p^{G}\) generated by
\[
\left\{G_{+} \underset{H}{\otimes} N^{T} S^{1}|T \in \mathcal{O}(H),|T| \geq n\} .\right.
\]

This is the category of \(\mathcal{O}\)-slice \(n\)-connective spectra.

Remark B.5. Given a finite \(G\)-set \(T\), we have an equivariant homeomorphism
\[
N^{T} S^{1} \cong S^{\mathbb{R} \cdot T}
\]
the representation sphere associated to the permutation representation of \(T\). This means that the \(\mathcal{O}\)-slice \(n\)-connective spectra can be equivalently viewed as being generated by the representation spheres associated to the permutation representations for admissible sets of cardinality at least \(n\).

Viewing this instead as a diagram of localizing subcategories (i.e., as a categorical Mackey functor), we are forming the equivariant localizing subcategory generated at \(G / H\) by \(N^{T} S^{1}\) for all admissible \(H\)-sets \(T\) of cardinality at least \(n\).

For the next definition, recall that the nullification at a set of objects \(\left\{S_{i}\right\}\) in \(\mathcal{S} p^{G}\) is the left Bousfield localization at the set of terminal maps \(\left\{S_{i} \rightarrow *\right\}\).

Definition B.6. If \(\mathcal{O}\) is an indexing system, then:
- The \(n\)th \(\mathcal{O}\)-slice truncation is the functor
\[
P_{\mathcal{O}}^{n}: \mathcal{S} p_{\geq 0}^{G} \rightarrow \mathcal{S} p_{\geq 0}^{G}
\]
that is the nullification killing \(\tau_{\geq(n+1)}^{\mathcal{O}}\).
- The \(n\)th \(\mathcal{O}\)-slice cover is the functor
\[
P_{n}^{\mathcal{O}}: \mathcal{S} p_{\geq 0}^{G} \rightarrow \mathcal{S} p_{\geq 0}^{G}
\]
defined to be the (homotopy) fiber of the natural map \(I d \Rightarrow P_{\mathcal{O}}^{n-1}\).
The truncation functors are related in the evident fashion as \(n\) varies.
Proposition B.7 For each \(n \geq 0\), we have a natural transformation
\[
P_{\mathcal{O}}^{n}(-) \Rightarrow P_{\mathcal{O}}^{n-1}(-)
\]

These are compatible with the natural nullification functors
\[
I d \Rightarrow P_{\mathcal{O}}^{n}(-)
\]

For a connective \(G\)-spectrum \(E\), the natural map
\[
E \rightarrow \lim _{\longleftarrow} P_{\mathcal{O}}^{n}(E)
\]
is always a weak equivalence.
Proof. The inclusion of categories \(\tau_{n+2}^{\mathcal{O}} \subset \tau_{n+1}^{\mathcal{O}}\) induces a natural transformation the other way of nullification functors. Since we can factor the nullification functor \(P_{\mathcal{O}}^{n}\) via this inclusion, the first two statements follow.

For the second, we note that the Postnikov connectivity of \(G_{+} \underset{H}{\otimes} N^{T} S^{1}\) for a finite \(H\)-set \(T\) is \(|T / H|\). As \(n\) goes to infinity, this also does (at worst as \(|T| /|H|\) ). In particular, the map
\[
E \rightarrow P_{\mathcal{O}}^{n}(E)
\]
has coconnectivity going to infinity.

For any bounded below spectrum \(K\), the same argument shows that the natural map
\[
K \otimes E \rightarrow \lim _{\leftarrow}\left(K \otimes P^{n} E\right)
\]
is an equivalence.
Definition B.8. A \(G\)-spectrum \(E\) is an \(\mathcal{O}-n\)-slice if
1. it is in \(\tau_{\geq n}^{\mathcal{O}}\), and
2. the natural map
\[
E \rightarrow P_{\mathcal{O}}^{n} E
\]
is an equivalence.
Proposition B.9. For any indexing system \(\mathcal{O}\), the ordinary suspension yields maps
\[
\Sigma: \tau_{\geq k}^{\mathcal{O}} \rightarrow \tau_{\geq(k+1)}^{\mathcal{O}} .
\]

Proof. Since suspension commutes with homotopy colimits and induction, it suffices to show this on the generators \(N^{T} S^{1}\) as \(T\) varies over the admissible sets of \(\mathcal{O}\). Since \(\Sigma N^{T} S^{1} \simeq N^{T \amalg *} S^{1}\), the result follows: if \(T\) is admissible and of cardinality at least \(k\) then \(T \amalg *\) is admissible and has cardinality at least \(k+1\).

Corollary B.10. For any \(k \geq 0\), the \(\infty\)-category of \(\mathcal{O}\) - \(k\)-slices is discrete.
Proof. If \(E, E^{\prime}\) are \(\mathcal{O}-k\)-slices, then they are both in \(\tau_{\geq k}^{\mathcal{O}}\). By the usual adjunctions, for all \(n \geq 1\), the higher homotopy group \(\pi_{n}\) of the mapping space are given by
\[
\pi_{n} \operatorname{Map}\left(E, E^{\prime}\right)=\left[\Sigma^{n} E, E^{\prime}\right]^{G}=0
\]
since the preceding proposition implies that \(\Sigma^{n} E \in \tau_{\geq(k+n)}^{\mathcal{O}}\).
Definition B.11. We define \(n^{\text {th }} \mathcal{O}\)-slice of a connective \(G\)-spectrum \(E\), denoted \(P_{n, \mathcal{O}}^{n}(E)\), to be the homotopy fiber of the natural map
\[
P_{\mathcal{O}}^{n}(E) \rightarrow P_{\mathcal{O}}^{n-1}(E)
\]

\section*{Characterizing slice towers via connectivity}

Geometric fixed points and slice connectivity We can detect slice connectivity in terms of the connectivity of the geometric fixed points [4, 6]. To express this, it is convenient to define the following function capturing the structure of the indexing system.

Definition B.12. For any transfer system \(\mathcal{O}\), we define the characteristic function of \(\mathcal{O}\)
\[
\chi^{\mathcal{O}}: \operatorname{Sub}(G) \rightarrow \operatorname{Sub}(G)
\]
by the formula
\[
\chi^{\mathcal{O}}(H)=\min \{K \mid K \rightarrow H\}=\bigcap_{K \rightarrow H} K
\]

The geometric fixed points of \(\tau_{\geq n}^{\mathcal{O}}\) Stable equivalences in \(\mathcal{S} p^{G}\) can be detected as maps that induce non-equivariant stable equivalences on passage to geometric fixed points for all (closed) subgroups of \(G\). It should thus be very plausible that the connectivity of geometric fixed points is a central notion.

Definition B.13. For a \(G\)-spectrum \(E\), let the geometric connectivity, denoted \(\operatorname{gconn}(E)\), be the function from subgroups of \(G\) to \(\mathbb{Z} \cup\{ \pm \infty\}\) defined by
\[
\operatorname{gconn}(E)(H):=\operatorname{conn}\left(\phi^{H}(E)\right) .
\]

Lemma B.14. Let \(\mathcal{O}\) be a transfer system. If \(E \in \tau_{\geq n}^{\mathcal{O}}\), then for all \(H \subset G\),
\[
\left[H: \chi^{\mathcal{O}}(H)\right] \cdot \operatorname{gconn}(E)(H) \geq n .
\]

Proof. By restriction, it suffices to show this for \(H=G\). Since the geometric fixed points preserve homotopy colimits and extensions, it suffices to show this for generators. Next, since geometric fixed points applied to an induced \(G\)-spectrum vanish, we are reduced to considering the case of \(N^{T} S^{1}\) for \(T\) an admissible \(G\)-set of cardinality at least \(n\). Decompose \(T\) as
\[
T=\sum_{H} n_{H} G / H
\]

The geometric fixed points of \(N^{T} S^{1}\) are \(S^{|T / G|}\), and in this case, we have
\[
|T / G|=\sum_{H} n_{H}
\]

We have by assumption
\[
|T|=\sum_{H} n_{H}[G: H] \geq n
\]
and by definition, \(\left[G: \chi^{\mathcal{O}}(H)\right]\) is the maximal element in
\[
\{[G: H] \mid G / H \in \mathcal{O}(*)\}
\]
(and in fact, all others divide it). This gives inequalities
\[
\left[G: \chi^{\mathcal{O}}(G)\right] \cdot \sum_{H} n_{H} \geq \sum_{H} n_{H}[G: H] \geq n
\]
as desired.
Remark B.15. If \(\chi^{\mathcal{O}}(G)=\{e\}\), then we recover [4, Theorem 2.5].
For the converse, we can again use isotropy separation, studying the cofiber sequence
\[
E \mathcal{F}_{+} \otimes E \rightarrow E \rightarrow \tilde{E} \mathcal{F} \otimes E
\]

The spectrum \(E \mathcal{F}_{+} \otimes E\) is built out of pieces of the form \(G / H_{+} \otimes E\), so this is in a localizing subcategory if and only if the restrictions are.

Lemma B.16. Let \(\mathcal{F}\) be a family, and let \(\tau\) be an equivariant localizing subcategory. If \(E\) is any \(G\)-spectrum such that for all \(H \in \mathcal{F}, i_{H}^{*} E \in i_{H}^{*} \tau\), then
\[
\left(E \mathcal{F}_{+} \otimes E\right) \in \tau
\]

Proof. This follows by the same proof as [4, Lemma 2.4]: the spectrum \(E \mathcal{F}_{+} \otimes E\) is in the localizing category generated by \(G / H_{+} \otimes E\) for \(H \in \mathcal{F}\). By assumption, we have an inclusion
\[
G / H_{+} \otimes E \cong G_{+} \underset{H}{\otimes} i_{H}^{*} E \in \tau
\]

The \(\mathcal{O}\)-slices of geometric spectra Our argument will use downward induction on the subgroup lattice, so we will need to understand the \(\mathcal{O}\)-slice connectivity of \(\tilde{E} \mathcal{P} \otimes E\), where \(\mathcal{P}\) is the family of proper subgroups of \(G\). Recall that a \(G\)-spectrum \(E\) is called "geometric" if the natural map
\[
E \rightarrow \tilde{E} \mathcal{P} \otimes E
\]
is an equivalence [2, Definition 6.10], and a Mackey functor \(\underline{M}\) is geometric if \(H \underline{M}\) is. The proof of [2, Theorem 6.7] goes through essentially without change to show the following.
Lemma B.17. Let \(\underline{M}\) be a geometric Mackey functor. For any \(\mathcal{O}\),
\[
\Sigma^{k} H \underline{M}
\]
is a \(k \cdot\left[G: \chi^{\mathcal{O}} G\right]\)-O-slice.
Proof. Since \(\underline{M}\) is geometric, we have that for any finite \(G\)-set \(T\), the natural map
\[
S^{|T / G|} \hookrightarrow N^{T} S^{1}
\]
given by the inclusion of fixed points induces an equivalence
\[
S^{|T / G|} \otimes H \underline{M} \rightarrow N^{T} S^{1} \otimes H \underline{M}
\]

We can bound the \(\mathcal{O}\)-slice connectivity from below by choosing an \(\mathcal{O}\)-admissible \(T\) with \(|T|\) as large as possible so that \(|T / G|=k\) is fixed. This is again achieved by taking
\[
T=k G / \chi^{\mathcal{O}}(G)
\]
since \(\chi^{\mathcal{O}}(G)\) is the minimal subgroup \(H\) such that \(H \rightarrow G\). This shows us that
\[
\Sigma^{k} H \underline{M} \in \tau_{\geq k\left[G: \chi^{\mathcal{O}}(G)\right]}^{\mathcal{O}}
\]

For the upper bound, consider an admissible \(G\)-set \(T\) such that
\[
|T|>k\left[G: \chi^{\mathcal{O}}(G)\right]
\]

Since \(k\left[G: \chi^{\mathcal{O}}(G)\right]\) is the largest cardinality of an admissible \(G\)-set with \(k\)-orbits, we deduce that \(|T / G|>k\). Since \(\underline{M}\) is geometric, we therefore deduce
\[
\left[N^{T} S^{1}, \Sigma^{k} H \underline{M}\right]^{G} \cong\left[\Phi^{G} N^{T} S^{1}, \Sigma^{k} H \underline{M}(G / G)\right] \cong\left[S^{|T / G|}, \Sigma^{k} H \underline{M}(G / G)\right]=0 .
\]

This shows that \(H \underline{M}\) is a \(k\left[G: \chi^{\mathcal{O}}(G)\right]\)-slice.

Rewriting \(\mathcal{O}\)-slice connectivity Putting these together, we get the full \(\mathcal{O}\)-slice version of [4, Theorem 2.5].

Theorem B.18. A \(G\)-spectrum \(E\) is in \(\tau_{\geq n}^{\mathcal{O}}\) if and only if for all \(H \subset G\),
\[
\left[H: \chi^{\mathcal{O}}(H)\right] \cdot \operatorname{gconn}(E)(H) \geq n .
\]

Proof. The proof is essentially that of [4, Theorem 2.5]. The forward direction is Lemma B.14.
For the other direction, let \(E\) be a spectrum with the prescribed geometric connectivities. Consider the isotropy separation sequence
\[
E P_{+} \otimes E \rightarrow E \rightarrow \tilde{E} \mathcal{P} \otimes E
\]

By Lemma B.17, the \(\mathcal{O}\)-slice connectivity of \(\tilde{E} \mathcal{P} \otimes E\) is at least \(n\). By induction on the subgroup lattice, Lemma B.16 shows that \(E P_{+} \otimes E\) also has \(\mathcal{O}\)-slice connectivity \(n\). Since localizing categories are closed under extensions, this implies that \(E\) has \(\mathcal{O}\)-slice connectivity \(n\).

Rewriting this slightly, we have a way to describe the slice connectivity of an arbitrary 0 -connective spectrum.

Corollary B.19. If \(E \in \mathcal{S} p_{\geq 0}^{G}\), then let
\[
n=\min _{H \subseteq G}\left\{\left[H: \chi^{\mathcal{O}}(H)\right] \cdot \operatorname{gconn}(E)(H)\right\}
\]

Then \(E \in \tau_{\geq n}^{\mathcal{O}}\).

\section*{B.5.1 References}
[1] S. Balchin, D. Barnes, and C. Roitzheim. N \({ }_{\infty}\)-operads and associahedra. Pacific J. Math., 315(2):285-304, 2021.
[2] M. A. Hill. The equivariant slice filtration: a primer. Homology Homotopy Appl., 14(2):143-166, 2012.
[3] M. A. Hill, M. J. Hopkins, and D. C. Ravenel. On the nonexistence of elements of Kervaire invariant one. Ann. of Math. (2), 184(1):1-262, 2016.
[4] M. A. Hill and C. Yarnall. A new formulation of the equivariant slice filtration with applications to \(C_{p}\)-slices. Proc. Amer. Math. Soc., 146(8):3605-3614, 2018.
[5] J. Rubin. Detecting Steiner and linear isometries operads. Glasg. Math. J., 63(2):307-342, 2021.
[6] D. Wilson. On categories of slices. arxiv.org: 1711.03472, 2017.

\section*{B. 6 Question 6: Daniel Spielman}

\section*{Author: Dan Spielman}

Title: Light Sets of Vertices
Throughout this note, \(G=(V, E, w)\) will be a weighted graph with \(n\) vertices. For an edge \((s, t) \in E\), we let \(w(s, t)\) be its weight. For two vertex sets, \(S\) and \(T\), the subgraph \(G_{S, T}\) of \(G\) has vertex set \(V\), but only the edges going between vertices in \(S\) and \(T\). We write \(G_{S}\) for the graph that only contains the edges between vertices in \(S\).

The matrix \(L\) is the Laplacian of \(G\), which we recall may be defined by
\[
L=\sum_{(s, t) \in E} w(s, t)\left(\boldsymbol{\delta}_{s}-\boldsymbol{\delta}_{t}\right)\left(\boldsymbol{\delta}_{s}-\boldsymbol{\delta}_{t}\right)^{T},
\]
where \(\boldsymbol{\delta}_{s}\) is the elementary unit vector with a \(\mathbf{1}\) in position \(s\). We let \(L_{S}\) denote the Laplacian of \(G_{S}\). As \(G_{S}\) and \(G\) have been defined to have the same vertex set, \(L_{S}\) has the same dimension as \(L\).

Lemma B.1. For every weighted graph \(G=(V, E, w)\) with \(n\) vertices, and for every \(0<\epsilon<1\), there is an \(S \subseteq V\) of size at least \(\epsilon n / 42\) so that
\[
\epsilon L \succcurlyeq L_{S} .
\]

We call such a set of vertices \(S\) an \(\epsilon\)-light set. A set \(S\) is 0 -light if and only if it is independent, and we could view lightness as a qualitative measure of independence. We might have called it "spectral independence," if that term were not already in use.

This lemma was proved by Daniel Spielman while working on the paper "Sparsified Cholesky Solvers for SDD linear systems", written with Richard Peng and Yin-Tat Lee [LPS15]. We decided not to include the lemma in that paper because, while it could be used to obtain interesting variants of some results, it was not necessary for the main results in that paper. That paper evolved into the paper "Sparsified Cholesky and Multigrid Solvers for Connection Laplacians," written with Rasmus Kyng, Yin Tat Lee, Richard Peng and Sushant Sachdeva [KLP \({ }^{+}\)16].

Proof Strategy We define \(L_{S, T}\) to be the Laplacian of \(G_{S, T}\). For a vertex \(t\) and a subset of vertices \(S\), we define \(L_{S, t}\) to be the Laplacian of \(G_{S,\{t\}}\).

For a matrix \(L\), we write its pseudo-inverse as \(L^{\dagger}\). We write \(L^{\dagger / 2}\) for the square root of the pseudo-inverse. We will prove the following statement that is equivalent to Lemma B. 1
\[
\left\|L^{\dagger / 2} L_{S} L^{\dagger / 2}\right\| \leq \epsilon .
\]

We will find it convenient to multiply all Laplacian matrices on the left and right by \(L^{\dagger / 2}\). So, we define
\[
\widetilde{L}_{S}=L^{\dagger / 2} L_{S} L^{\dagger / 2}, \quad \widetilde{L}_{S, T}=L^{\dagger / 2} L_{S, T} L^{\dagger / 2}, \quad \widetilde{L}_{S, t}=L^{\dagger / 2} L_{S, t} L^{\dagger / 2}
\]
and recall that \(L^{\dagger / 2} L L^{\dagger / 2} \stackrel{\text { def }}{=} \Pi\) is a symmetric projection matrix.
We are going to build up \(S\) in a greedy fashion. We will begin with a singleton set, and then add one vertex at a time. As we add vertices to \(S\), we will need to maintain bounds on two quantities:
a modification of the upper barrier function from [BSS12] and the sum of the leverage scores of edges between \(S\) and \(V \backslash S\).

The leverage score of an edge ( \(s, t\) ) is defined to be \(w(s, t)\) times the effective resistance between \(s\) and \(t\) :
\[
\ell(s, t)=w(s, t)\left(\boldsymbol{\delta}_{s}-\boldsymbol{\delta}_{t}\right)^{T} L^{\dagger}\left(\boldsymbol{\delta}_{s}-\boldsymbol{\delta}_{t}\right)=\operatorname{Tr}\left(w(s, t)\left(\boldsymbol{\delta}_{s}-\boldsymbol{\delta}_{t}\right)\left(\boldsymbol{\delta}_{s}-\boldsymbol{\delta}_{t}\right)^{T} L^{\dagger}\right)=\operatorname{Tr}\left(L_{\{s\},\{t\}} L^{\dagger}\right)
\]

For vertices \(s\) and \(t\) for which ( \(s, t\) ) is not an edge, we define \(\ell(s, t)=0\). For subsets of vertices \(S\) and \(T\), we define
\[
\ell(S, T) \stackrel{\text { def }}{=} \sum_{s \in S} \sum_{t \in T} \ell(s, t)=\sum_{s \in S} \sum_{t \in T:(s, t) \in E} \ell(s, t)
\]
and
\[
\ell(S) \stackrel{\text { def }}{=} \ell(S, V-S)
\]

Claim B.2. For \(S\) and \(T\) subsets of vertices, \(\ell(S, T)=\operatorname{Tr}\left(\widetilde{L}_{S, T}\right)\).
Proof. From the definition of the Laplacian of a graph, we have \(L_{S, T}=\sum_{s \in S} \sum_{t \in T} L_{\{s\},\{t\}}\). So,
\[
\begin{aligned}
\operatorname{Tr}\left(\widetilde{L}_{S, T}\right)=\operatorname{Tr}\left(L^{\dagger / 2} L_{S, T} L^{\dagger / 2}\right)= & \operatorname{Tr}\left(L_{S, T} L^{\dagger}\right) \\
& =\sum_{s \in S} \sum_{t \in T} \operatorname{Tr}\left(L_{\{s\},\{t\}} L^{\dagger}\right)=\sum_{s \in S} \sum_{t \in T} \ell(s, t)=\ell(S, T)
\end{aligned}
\]

We modify the BSS barrier function to make it better suited to matrices of rank at most \(\sigma\) by only incorporating the largest \(\sigma\) eigenvalues of the matrix. For a matrix \(A\) with eigenvalues \(\lambda_{1} \geq \lambda_{2} \geq \cdots \geq \lambda_{n}\), and a \(u>\lambda_{1}\), we define
\[
\Phi_{\sigma}^{u}(A) \stackrel{\text { def }}{=} \sum_{i=1}^{\sigma} \frac{1}{u-\lambda_{i}}
\]

If \(u \leq \lambda_{1}\), we define \(\Phi_{\sigma}^{u}(A)=\infty\). We overload the definition of \(\Phi\) by setting
\[
\Phi_{\sigma}^{u}(S) \stackrel{\text { def }}{=} \Phi_{\sigma}^{u}\left(\widetilde{L}_{S}\right)
\]

Our objective is to find a set \(S\) of size \(\sigma\) so that \(\Phi_{\sigma}^{\epsilon}(S)<\infty\).
We deal with this barrier function by considering a modified trace of a matrix that only sums the largest \(\sigma\) eigenvalues of its argument:
\[
\operatorname{Tr}_{\sigma}(A) \stackrel{\text { def }}{=} \sum_{i=1}^{\sigma} \lambda_{i}
\]
where the eigenvalues of \(A\) are \(\lambda_{1} \geq \lambda_{2} \geq \cdots \geq \lambda_{n}\). We then have \(\Phi_{\sigma}^{u}(A)=\operatorname{Tr}_{\sigma}\left((u I-A)^{-1}\right)\). In all cases we consider, the argument of \(\operatorname{Tr}_{\sigma}\) is a diagonalizable matrix with real eigenvalues.

For the rest of this note, define
\[
\delta \stackrel{\text { def }}{=} \frac{21}{n}, \quad \phi \stackrel{\text { def }}{=} \frac{n}{21}, \quad \text { and } \quad \sigma \stackrel{\text { def }}{=}\lfloor\epsilon n / 42\rfloor
\]

We will prove Lemma B.1 by iteratively applying the following lemma.

Lemma B.3. If \(|S| \leq \sigma, \ell(S) \leq 4|S|\), and \(\Phi_{\sigma}^{u}(S) \leq \phi\), then there is a \(t \notin S\) so that
\[
\Phi_{\sigma}^{u+\delta}(S \cup\{t\}) \leq \phi \quad \text { and } \quad \ell(S \cup\{t\}) \leq \ell(S)+4 .
\]

Proof. Lemma B. 4 says that for more than half the \(t \notin S, \ell(S \cup\{t\}) \leq \ell(S)+4\). And, under the conditions of the lemma, Lemma B. 8 says that for at least half the \(t \notin S, \Phi_{\sigma}^{u}(S \cup\{t\}) \leq \phi\). So, there is a \(t \notin S\) that satisfies both conditions.

Proof of Lemma B.1. Set \(u_{0}=\epsilon / 2\) and let \(S_{0}=\left\{v_{0}\right\}\) an arbitrary \(v_{0} \in V\). As \(G_{S_{0}}\) has no edges,
\[
\Phi_{\sigma}^{u_{0}}\left(S_{0}\right)=\sigma / u_{0} \leq \frac{n}{21}=\phi
\]

By applying Lemma B. \(3 \sigma\) times, we inductively construct a set \(S\) of \(\sigma+1\) vertices so that \(\ell(S) \leq 4 \sigma\) and \(\Phi_{\sigma}^{u_{0}+\sigma \delta}(S) \leq \phi\). This implies that all of the eigenvalues of \(\widetilde{L}_{S}\) are at most
\[
u_{0}+\sigma \delta=\frac{\epsilon}{2}+\sigma \frac{21}{n} \leq \epsilon
\]

\section*{Proofs}

Lemma B.4. Let \(S \subset V\). Then, for more than half the \(t\) not in \(S\),
\[
\ell(S \cup\{t\}) \leq \ell(S)+4
\]

Proof. Recall \(\ell(S \cup\{t\})=\ell(S \cup\{t\}, V-(S \cup\{t\}))\). For \(t \notin S\), we use the inequality
\[
\ell(S \cup\{t\}, V-(S \cup\{t\})) \leq \ell(S \cup\{t\}, V-S)=\ell(S)+\ell(t, V-S)
\]

So, it suffices to show that for more than half the \(t \notin S, \ell(t, V-S) \leq 4\). This follows from the non-negativity of \(\ell\) and Claim B. 5 which shows that
\[
\sum_{t \in V-S} \ell(t, V-S)<2|V-S|
\]

Claim B.5. For every \(T \subset V\),
\[
\sum_{t \in T} \ell(t, T) \leq 2(|T|-1)
\]

Proof.
\[
\sum_{t \in T} \ell(t, T)=\sum_{t \in T} \operatorname{Tr}\left(L_{\{t\}, T} L^{\dagger}\right)=2 \operatorname{Tr}\left(L_{T} L^{\dagger}\right)
\]

To show that \(\operatorname{Tr}\left(L_{T} L^{\dagger}\right)<|T|\), observe that \(L_{T} \preccurlyeq L\), so all the eigenvalues of \(L_{T} L^{\dagger}\) are between o and 1. Because \(L_{T}\) has rank at most \(|T|-1\), at most \(|T|-1\) eigenvalues of \(L_{T} L^{\dagger}\) are non-zero.

For convenience, we now state a few key properties of the function \(\operatorname{Tr}_{\sigma}\) of a matrix. We begin with its defect: it is not additive. But, Ky Fan's eigenvalue inequality (see Theorem 4.3.47a of [HJ12]) tells us that it is subadditive:
\[
\operatorname{Tr}_{\sigma}(A+B) \leq \operatorname{Tr}_{\sigma}(A)+\operatorname{Tr}_{\sigma}(B)
\]

Most of the properties of \(\operatorname{Tr}_{\sigma}\) that we find helpful follow from the fact that, for matrices \(A\) and \(B, A B\) has the same non-zero eigenvalues as \(B A\), counted with multiplicity.

Proposition B.6. For symmetric matrices \(A\) and \(B\),
a. \(\operatorname{Tr}_{\sigma}(A)=\max _{U} \operatorname{Tr}\left(U A U^{T}\right)\), where the maximum is taken over all orthogonal matrices of rank \(\sigma\).
b. If \(A\) is positive semidefinite, then \(\operatorname{Tr}_{\sigma}(A B)=\operatorname{Tr}_{\sigma}(B A)\).
c. If \(A\) and \(B\) are positive semidefinite, then \(\operatorname{Tr}_{\sigma}(A B) \geq 0\).
d. If \(A \preccurlyeq B\), then \(\operatorname{Tr}_{\sigma}(A) \leq \operatorname{Tr}_{\sigma}(B)\).
e. If \(C\) is positive semidefinite and \(A \preccurlyeq B\), then \(\operatorname{Tr}_{\sigma}(A C) \leq \operatorname{Tr}_{\sigma}(B C)\).

Proof. Part a is Ky Fan's maximum principle, proved in [Fan49]. Part bis a direct consequence of the facts that \(A B\) has \(n\) real eigenvalues if \(A\) is positive semidefinite, and \(A B\) and \(B A\) have the same non-zero eigenvalues. Part follows from the fact that all eigenvalues of the product of positive semidefinite matrices are non-negative. Part d follows from using (B.1) to show \(\operatorname{Tr}_{\sigma}(A) \leq \operatorname{Tr}_{\sigma}(B)+\operatorname{Tr}_{\sigma}(A-B) \leq \operatorname{Tr}_{\sigma}(B)\), using the fact that \(A-B\) is negative semidefinite and so \(\operatorname{Tr}_{\sigma}(A-B) \leq 0\). To derive part e from part d, let \(V\) be a matrix so that \(V^{T} V=C\), and apply b to show the conclusion is equivalent to \(\operatorname{Tr}_{\sigma}\left(V A V^{T}\right) \leq \operatorname{Tr}_{\sigma}\left(V B V^{T}\right)\), which follows from \(V A V^{T} \preccurlyeq V B V^{T}\).

Note that \(\widetilde{L}_{S \cup\{t\}}=\widetilde{L}_{S}+\widetilde{L}_{S, t}\). To show that we can choose \(\mathrm{a} t \notin S\) that does not increase the barrier function, we employ the following adaptation of Lemma 19 of [SHS15], which in turn is an adaptation of Lemma 3.3 from [BSS12]. We include a proof for completeness.

Lemma B.7. Let \(A\) and \(B\) be positive semidefinite matrices, \(\delta>0\), and let \(M=(u+\delta) I-A\). If \(\Phi_{\sigma}^{u}(A)<\infty\) and
\[
\frac{\operatorname{Tr}_{\sigma}\left(M^{-2} B\right)}{\Phi_{\sigma}^{u}(A)-\Phi_{\sigma}^{u+\delta}(A)}+\operatorname{Tr}_{\sigma}\left(M^{-1} B\right)<1
\]
then \(\Phi_{\sigma}^{u+\delta}(A+B) \leq \Phi_{\sigma}^{u}(A)\).
Proof. Our assumption that \(\Phi_{\sigma}^{u}(A)<\infty\) implies that \(M, M^{-1}\), and \(M^{-2}\) are all positive definite. Thus, Proposition B. 6 Implies that both terms in (B.2) are non-negative. Let \(C\) be a matrix for which \(B=C C^{T}\), and so by Proposition B. \(4 \operatorname{Tr}_{\sigma}\left(M^{-1} B\right)=\operatorname{Tr}_{\sigma}\left(C^{T} M^{-1} C\right)<1\).

Recall \(\Phi_{\sigma}^{u+\delta}(A+B)=\operatorname{Tr}_{\sigma}\left(\left(M-C C^{T}\right)^{-1}\right)\). By the Sherman-Morrison-Woodbury formula,
\[
\left(M-C C^{T}\right)^{-1}=M^{-1}+M^{-1} C\left(I-C^{T} M^{-1} C\right)^{-1} C^{T} M^{-1}
\]

As \(\left\|C^{T} M^{-1} C\right\| \leq \operatorname{Tr}_{\sigma}\left(C^{T} M^{-1} C\right)<1\), we know that right-hand term is positive definite, and thus all eigenvalues of \(A+B\) are less than \(u+\delta\). Now, (B.1) implies
\[
\Phi_{\sigma}^{u+\delta}(A+B) \leq \operatorname{Tr}_{\sigma}\left(M^{-1}\right)+\operatorname{Tr}_{\sigma}\left(M^{-1} C\left(I-C^{T} M^{-1} C\right)^{-1} C^{T} M^{-1}\right)
\]

By Propositon B. 6 p .
\[
\operatorname{Tr}_{\sigma}\left(M^{-1} C\left(I-C^{T} M^{-1} C\right)^{-1} C^{T} M^{-1}\right)=\operatorname{Tr}_{\sigma}\left(\left(I-C^{T} M^{-1} C\right)^{-1} C^{T} M^{-2} C\right)
\]

As \(\left\|C^{T} M^{-1} C\right\| \leq \operatorname{Tr}_{\sigma}\left(C^{T} M^{-1} C\right)<1,\left(I-C^{T} M^{-1} C\right)^{-1} \preccurlyeq\left(1-\operatorname{Tr}_{\sigma}\left(C^{T} M^{-1} C\right)\right)^{-1} I\), and by Proposition B.6 [1].
\[
\operatorname{Tr}_{\sigma}\left(\left(I-C^{T} M^{-1} C\right)^{-1} C^{T} M^{-2} C\right) \leq \frac{\operatorname{Tr}_{\sigma}\left(C^{T} M^{-2} C\right)}{1-\operatorname{Tr}_{\sigma}\left(C^{T} M^{-1} C\right)}
\]

Writing \(\operatorname{Tr}_{\sigma}\left(M^{-1}\right)=\Phi_{\sigma}^{u}(A)-\left(\Phi_{\sigma}^{u}(A)-\Phi_{\sigma}^{u+\delta}(A)\right)\), we obtain
\[
\Phi_{\sigma}^{u+\delta}(A+B) \leq \Phi_{\sigma}^{u}(A)-\left(\Phi_{\sigma}^{u}(A)-\Phi_{\sigma}^{u+\delta}(A)\right)+\frac{\operatorname{Tr}_{\sigma}\left(C^{T} M^{-2} C\right)}{1-\operatorname{Tr}_{\sigma}\left(C^{T} M^{-1} C\right)}
\]
which B.2) and Proposition B. 6 pimply is at most \(\Phi_{\sigma}^{u}(A)\).
We will apply this result with \(A=\widetilde{L}_{S}\) and \(B=\widetilde{L}_{S, t}\). When these terms, along with \(u\) and \(\delta\) are given, it will be convenient to write
\[
U(S, t) \stackrel{\text { def }}{=} \frac{\operatorname{Tr}_{\sigma}\left(M^{-2} \widetilde{L}_{S, t}\right)}{\Phi_{\sigma}^{u}(S)-\Phi_{\sigma}^{u+\delta}(S)}+\operatorname{Tr}_{\sigma}\left(M^{-1} \widetilde{L}_{S, t}\right)
\]

Lemma B.8. If \(|S| \leq \sigma, \Phi_{\sigma}^{u}(S) \leq \phi\), and \(\ell(S) \leq 4|S|\), then for at least half the \(t \notin S\),
\[
U(S, t)<1
\]

Proof. We will prove that
\[
\sum_{t \notin S} U(S, t) \leq \frac{5}{\delta}+5 \phi
\]

As \(U(S, t)\) is non-negative, this implies that for at least half the \(t \notin S\),
\[
U(S, t) \leq \frac{2}{n-|S|}\left(\frac{5}{\delta}+5 \phi\right) \leq \frac{2}{n} \frac{42}{41}\left(\frac{5 n}{21}+\frac{5 n}{21}\right)<1
\]

We need to upper bound the terms \(\operatorname{Tr}_{\sigma}\left(M^{p} \widetilde{L}_{S, t}\right)\) for \(p \in\{-1,-2\}\). We do this by breaking each term into two parts. Let \(\Pi_{S}\) be the symmetric projection onto the span of \(\widetilde{L}_{S}\) and let \(\Pi_{T}=I-\Pi_{S}\). As \(M=(u+\delta)\left(\Pi_{S}+\Pi_{T}\right)-\widetilde{L}_{S}, \Pi_{T} \Pi_{S}=\Pi_{T} \widetilde{L}_{S}=0\), and \(\Pi_{S}^{p}=\Pi_{S}\),
\[
M^{p}=(u+\delta)^{p} \Pi_{T}+\left((u+\delta) \Pi_{S}-\widetilde{L}_{S}\right)^{p}
\]

By the subadditivity of \(\operatorname{Tr}_{\sigma}\) we conclude
\[
\operatorname{Tr}_{\sigma}\left(M^{p} \widetilde{L}_{S, t}\right) \leq \operatorname{Tr}_{\sigma}\left((u+\delta)^{p} \Pi_{T} \widetilde{L}_{S, t}\right)+\operatorname{Tr}_{\sigma}\left(\left((u+\delta) \Pi_{S}-\widetilde{L}_{S}\right)^{p} \widetilde{L}_{S, t}\right) .
\]

The term invovling \(\Pi_{S}\) is addressed by Claim B.9, which says
\[
\sum_{t \notin S} \operatorname{Tr}_{\sigma}\left(\left((u+\delta) \Pi_{S}-\widetilde{L}_{S}\right)^{p} \widetilde{L}_{S, t}\right) \leq \operatorname{Tr}_{\sigma}\left(M^{p}\right)
\]

For the other term, we recall that \(\Pi_{T}\) and \(\widetilde{L}_{S, t}\) are positive semidefinite and so their product has only non-negative eigenvalues to show
\[
\operatorname{Tr}_{\sigma}\left((u+\delta)^{p} \Pi_{T} \widetilde{L}_{S, t}\right) \leq \operatorname{Tr}\left((u+\delta)^{p} \Pi_{T} \widetilde{L}_{S, t}\right)=(u+\delta)^{p} \operatorname{Tr}\left(\Pi_{T} \widetilde{L}_{S, t}\right) \leq(u+\delta)^{p} \operatorname{Tr}\left(\widetilde{L}_{S, t}\right)
\]

Claim B. 2 tells us that this equals \((u+\delta)^{p} \ell(S, t)\), giving
\[
\sum_{t \notin S} \operatorname{Tr}_{\sigma}\left((u+\delta)^{p} \Pi_{T} \widetilde{L}_{S, t}\right) \leq(u+\delta)^{p} \sum_{t \notin S} \ell(S, t)=(u+\delta)^{p} \ell(S) \leq(u+\delta)^{p} 4|S|
\]

To combine these terms, note that all the eigenvalues of \(M\) are at most \((u+\delta)\), and thus for \(p<0\) all the eigenvalues of \(M^{p}\) are at least \((u+\delta)^{p}\). This tells us that \(\operatorname{Tr}_{\sigma}\left(M^{p}\right) \geq \sigma(u+\delta)^{p} \geq|S|(u+\delta)^{p}\). We conclude that
\[
\sum_{t \neq S} \operatorname{Tr}_{\sigma}\left(M^{p} \widetilde{L}_{S, t}\right) \leq 5 \operatorname{Tr}_{\sigma}\left(M^{p}\right)
\]

To finish, we return to
\[
\sum_{t \notin S} U(S, t)=\sum_{t \notin S} \frac{\operatorname{Tr}_{\sigma}\left(M^{-2} \widetilde{L}_{S, t}\right)}{\Phi_{\sigma}^{u}(S)-\Phi_{\sigma}^{u+\delta}(S)}+\sum_{t \notin S} \operatorname{Tr}_{\sigma}\left(M^{-1} \widetilde{L}_{S, t}\right) \leq \frac{5 \operatorname{Tr}_{\sigma}\left(M^{-2}\right)}{\Phi_{\sigma}^{u}(S)-\Phi_{\sigma}^{u+\delta}(S)}+5 \operatorname{Tr}_{\sigma}\left(M^{-1}\right)
\]

The right-hand term is at most \(5 \Phi_{\sigma}^{u+\delta}(S)\), and Claim B. 10 shows that the left-hand term is at most \(\frac{5}{\delta}\). Summing these together gives the result.
Claim B.9. Assume that \(|S| \leq \sigma\). For \(M=(u+\delta) I-\widetilde{L}_{S}\), and nonzero real \(p\),
\[
\sum_{t \notin S} \operatorname{Tr}_{\sigma}\left(\left((u+\delta) \Pi_{S}-\widetilde{L}_{S}\right)^{p} \widetilde{L}_{S, t}\right) \leq \operatorname{Tr}_{\sigma}\left(M^{p}\right)
\]

Proof. Because both \(\widetilde{L}_{S, t}\) and \(\left((u+\delta) \Pi_{S}-\widetilde{L}_{S}\right)^{p}\) are positive semidefinite, the eigenvalues of their product are nonnegative, and so
\[
\operatorname{Tr}_{\sigma}\left(\left((u+\delta) \Pi_{S}-\widetilde{L}_{S}\right)^{p} \widetilde{L}_{S, t}\right) \leq \operatorname{Tr}\left(\left((u+\delta) \Pi_{S}-\widetilde{L}_{S}\right)^{p} \widetilde{L}_{S, t}\right)
\]

As \(\sum_{t \notin S} \widetilde{L}_{S, t}=\widetilde{L}_{S, T} \preccurlyeq I\), Proposition B. 6 dimplies
\[
\begin{aligned}
\sum_{t \notin S} \operatorname{Tr}(((u & \left.\left.+\delta) \Pi_{S}-\widetilde{L}_{S}\right)^{p} \widetilde{L}_{S, t}\right)=\operatorname{Tr}\left(\left((u+\delta) \Pi_{S}-\widetilde{L}_{S}\right)^{p} \widetilde{L}_{S, T}\right) \\
& \leq \operatorname{Tr}\left(\left((u+\delta) \Pi_{S}-\widetilde{L}_{S}\right)^{p}\right)=\operatorname{Tr}\left(\Pi_{S}\left((u+\delta) I-\widetilde{L}_{S}\right)^{p} \Pi_{S}\right)=\operatorname{Tr}\left(\Pi_{S} M^{p} \Pi_{S}\right)
\end{aligned}
\]

By Ky Fan's maximum principle (Proposition B. 6a) this latter term is at most \(\operatorname{Tr}_{\sigma}\left(M^{p}\right)\).

\section*{Claim B.io.}
\[
\Phi_{\sigma}^{u}(S)-\Phi_{\sigma}^{u+\delta}(S) \geq \delta \operatorname{Tr}_{\sigma}\left(M^{-2}\right)
\]

Proof. Let \(\lambda_{1}, \ldots, \lambda_{\sigma}\) be the largest \(\sigma\) eigenvalues of \(\widetilde{L}_{S}\). Then,
\[
\begin{aligned}
\Phi_{\sigma}^{u}(S)-\Phi_{\sigma}^{u+\delta}(S) & =\sum_{i=1}^{\sigma} \frac{1}{u-\lambda_{i}}-\sum_{i=1}^{\sigma} \frac{1}{u+\delta-\lambda_{i}} \\
& =\sum_{i=1}^{\sigma} \frac{\delta}{\left(u-\lambda_{i}\right)\left(u+\delta-\lambda_{i}\right)} \\
& \geq \sum_{i=1}^{\sigma} \frac{\delta}{\left(u+\delta-\lambda_{i}\right)^{2}} \\
& =\delta \operatorname{Tr}_{\sigma}\left(M^{-2}\right)
\end{aligned}
\]

\section*{B.6.1 References}
[BSS12] Joshua Batson, Daniel A Spielman, and Nikhil Srivastava. Twice-Ramanujan sparsifiers. SIAM Journal on Computing, 41(6):1704-1721, 2012.
[Fan49] Ky Fan. On a theorem of Weyl concerning eigenvalues of linear transformations I. Proceedings of the National Academy of Sciences of the United States of America, 35(11):652, 1949.
[HJ12] Roger A Horn and Charles R Johnson. Matrix analysis. Cambridge university press, 2012.
[KLP \({ }^{+}\)16] Rasmus Kyng, Yin Tat Lee, Richard Peng, Sushant Sachdeva, and Daniel A Spielman. Sparsified Cholesky and multigrid solvers for connection Laplacians. In Proceedings of the forty-eighth annual ACM symposium on Theory of Computing, pages 842-850. ACM, 2016.
[LPS15] Yin Tat Lee, Richard Peng, and Daniel A. Spielman. Sparsified Cholesky solvers for SDD linear systems. CoRR, abs/1506.08204, 2015.
[SHS15] Marcel K De Carli Silva, Nicholas JA Harvey, and Cristiane M Sato. Sparse sums of positive semidefinite matrices. ACM Transactions on Algorithms (TALG), 12(1):1-17, 2015.

\section*{B. 7 Question 7: Shmuel Weinberger}

Authors: Sylvain Cappell, S. Weinberger, and M. Yan
Title: Fowler's theorem for involutions

Fowler, in his Ph.D. thesis, proved that if \(\Gamma\) is a uniform lattice in a real semisimple group with odd torsion in \(\Gamma\) then there is no compact closed manifold \(M\) whose universal cover is rationally acyclic. A proof can be found in \(\left[\mathrm{W}_{2}\right]\). We show that the same is true for \(\Gamma\) with 2-torsion.

Without loss of generality (by considering a normal subgroup of finite index), it suffices to prove this for the special case where \(\Gamma=\pi \rtimes \mathbb{Z}_{2}\) for a torsion free group \(\pi\), a lattice in \(G\), for which there is an involution on \(M=K \backslash G / \pi\) (by isometries with the locally symmetric metric) whose fixed set \(F\) is not empty. ( \(F\) might be disconnected; for simplicity we will write what follows just for the connected case - there are no differences in the general case.)

Now suppose that \(X^{m}\) is a manifold with fundamental group \(\Gamma, Y\) its 2-fold cover, and suppose that the universal cover of \(X\) (and therefore \(Y\) ) are rationally acyclic. We will consider the symmetric signatures of \(Y\) in the (symmetric \(=\) quadratic L-group) \(L(\mathbb{R} \pi)\), where \(\mathbb{R}\) is the real numbers. There is an equivalence \(f: Y \rightarrow M\) which (while not degree one) gives an equivalence of symmetric signatures (because over \(\mathbb{R}\), all degrees have square roots, so the symmetric signature is only sensitive to the sign of the degree of the map). Since the Novikov conjecture is true for \(\pi\), the assembly map from \(H_{m}(B \pi ; L(\mathbb{R})) \rightarrow L_{m}(\mathbb{R} \pi)\) is injective, and this detects in the degree \(m\) piece \(H_{m}(B \pi ; \mathbb{Z})\) the class that these manifolds represent in group homology. It follows that this map is degree one. \(f_{*}[Y]=[M]\).

Now we use a cobordism argument from [W1]. We now consider the image of the fundamental class of any manifold \(Z\) with fundamental group \(\pi\) involution inducing this automorphism of \(\pi\) and the image of \([Z]\) in \(H_{m}\left(B \Gamma ; \mathbb{Z}_{2}\right)\). It follows from standard equivariant homotopy theory that \(Z\) has an equivariant map, \(g\), to \(M\), and thus there is a map from its fixed set \(Z^{\mathbb{Z}_{2}} \rightarrow F\). We claim that \(g_{*}[Z]=g_{*}\left[Z^{\mathbb{Z}_{2}}\right]\) where we make use of the map from \(\mathbb{Z}_{2} \times \pi_{1} F \rightarrow \Gamma\) (and the periodicity on the group homology of \(\mathbb{Z}_{2}\) to raise the dimension from that of \(F\) to \(\operatorname{dim} M\) ).

This cobordism is between \(Z\) and a projective space bundle over \(Z^{\mathbb{Z}_{2}}\) - namely the projectivized normal bundle to \(Z^{\mathbb{Z}_{2}}\). (The fundamental class of the latter is the desired element by the Leray-Hirsch theorem.) It is explicitly \(Z \times[0,1]\) and on \(Z \times\{1\} \bmod\) out in the complement of the equivariant regular neighborhood of \(Z^{\mathbb{Z}_{2}}\) the \(\mathbb{Z} / 2\) action.

Thus for \(Y\), this image is o, since the action is free. For \(M\) however, this is always nonzero. The action by \(\mathbb{Z}_{2}\) by isometries has fixed set which is aspherical and indeed the Borel construction for the action on \(M\) shows that \(\mathbb{Z}_{2} \times F \rightarrow \Gamma\) induces an injection on homology in dimension \(\operatorname{dim}\left(M / \mathbb{Z}_{2}\right)\) (and an isomorphism in higher dimensions, see [B]). Since the fundamental class of an aspherical manifold is always nontrivial in its group homology, we have a contradiction.

\section*{References}
[B ] A. Borel, A seminar on transformation groups, Princeton University Press 1960
[W1 ] S. Weinberger, Group actions and higher signatures II, CPAM 1987
[W2 ] S. Weinberger, Variations on a theorem of Borel, Cambridge University Press 2022

\section*{B. 8 Question 8: Mohammed Abouzaid}

Author: Mohammed Abouzaid

\section*{Title: Smoothing Lagrangian Surface}

Remark 1. This note is expanded from a short motivating discussion in a research paper that is supposed to develop a theory of polyhedral Lagrangian submanifolds for the purpose of being able to use computers to explore conjectures in symplectic topology. It includes some details that would normally be omitted (e.g. the proof of Lemma 1, which is a linear algebra exercise, and much of the explanation about closed 1 -forms). The paper does not cite any references as the reader is assumed to be able to deduce all asserted results from standard references, e.g. [1, 2].

I would like to thank Kyler Siegel and Umut Varolgunes for helpful discussions around this circle of ideas.

For the purpose of this note, we equip \(\mathbb{R}^{4}\) with coordinates \(\left(q_{1}, q_{2}, p_{1}, p_{2}\right)\), and with the standard symplectic form \(\omega=d p_{1} \wedge d q_{1}+d p_{2} \wedge d q_{2}\).

Definition 1. A polyhedral Lagrangian surface in \(\mathbb{R}^{4}\) is a finite polyhedral complex all of whose faces are Lagrangians, and which is a topological submanifold of \(\mathbb{R}^{4}\).

Proposition 1. If \(K\) is a polyhedral Lagrangian surface with the property that exactly 4 faces meet at every vertex, then there is a Hamiltonian isotopy \(K_{t}\) of smooth Lagrangian submanifolds, parameterised by ( 0,1 ], extending to a topological isotopy, parametrised by \([0,1]\), with endpoint \(K_{0}=K\).

In order to prove this result, we need two preliminary results: a local statement asserting triviality near each vertex, and a global statement implying the compatibility of these local trivialisations.

Lemma 1. For each embedding \(\mathbb{R}^{2} \rightarrow \mathbb{R}^{4}\) which is linear on the four quadrants with Lagrangian image, and whose image \(\Sigma\) is not contained in a plane, there is a linear symplectic transformation of \(\mathbb{R}^{4}\) which maps \(\Sigma\) to the product of the union of the positive coordinate axes in \(\mathbb{R}_{p_{1} q_{1}}^{2}\) and \(\mathbb{R}_{p_{2} q_{2}}^{2}\).

Proof. Let ( \(v_{1}, v_{2}, u_{1}, u_{2}\) ) denote tangent vectors at the origin to the edges of \(\Sigma\), ordered so that cyclically adjacent vectors span the faces of \(\Sigma\). The pairings \(\omega\left(v_{i}, u_{i}\right)\) cannot vanish, for otherwise \(\omega\) would identically vanish on a 3 -dimensional linear subspace. By swapping the pair of coordinates ( \(v_{i}, u_{i}\) ) if necessary, we may assume that both pairings are strictly positive, and by rescaling we may assume that they are 1 . We conclude that the vectors ( \(v_{1}, v_{2}, u_{1}, u_{2}\) ) form a standard symplectic basis for \(\mathbb{R}^{4}\), and that the mapping \(\partial_{p_{i}} \rightarrow v_{i}\) and \(\partial_{q_{i}} \rightarrow u_{i}\) is the desired linear transformation.

In the plane \(\mathbb{R}_{p q}^{2}\), the symplectic pairing projects the union of the positive axes homeomorphically to the dual of the line \(p=q\). Taking the product, and applying the previous Lemma, we conclude:

Corollary 1. There exists a linear Lagrangian plane \(L \subset \mathbb{R}^{4}\) so that the symplectic pairing \(\mathbb{R}^{4} \rightarrow L^{\vee}\) defines a homeomorphism \(\Sigma \rightarrow L^{\vee}\).

The previous corollary in particular equips \(\Sigma\) with a smooth structure arising from its projection to \(L^{\vee}\). This smooth structure will be fixed for the remainder of the discussion.

Given a choice of plane \(L\), we say that a Lagrangian \(\Lambda \subset \mathbb{R}^{4}\) is graphical if the symplectic pairing defines a diffeomorphism \(\Lambda \cong L^{\vee}\). If \(\Sigma\) were smooth, the standard description of Lagrangians
in cotangent bundles would imply that such Lagrangians bijectively correspond to smooth closed 1 -forms, which, because \(\Sigma\) is contractible and hence every closed form on it is exact, can be identified with smooth functions modulo addition of constants. We shall formulate a replacement for this correspondence that accounts for the singularities of \(\Sigma\).

To this end, let us choose further a Lagrangian splitting of the projection \(\mathbb{R}^{4} \rightarrow L^{\vee}\); we shall later see that our constructions are independent of this choice. The splitting gives a direct sum decomposition \(\mathbb{R}^{4} \cong L \oplus L^{\vee}\) (polarization), with respect to which the image of each quadrant is graphical over \(L^{\vee}\). Graphical (linear) Lagrangians bijectively correspond to quadratic forms, so we obtain quadratic forms \(\left\{q_{i j}\right\}_{i, j \in \pm}\) on \(L^{\vee}\) whose graphs contain the corresponding faces of \(\Sigma\). The restriction of the quadratic forms associated to any two faces agree to first order along the images in \(L^{\vee}\) of the edges of \(\Sigma\). Via the identification \(\Sigma \cong L^{\vee}\) from the previous corollary, we write \(q_{\Sigma}\) for the \(C^{1}\)-function on \(\Sigma\) whose restriction to each face is given by the composition of \(q_{i j}\) with the projection to \(L^{\vee}\). We use this to obtain an explicit description of the desired local smoothings, which will be essential in establishing the required global smoothability:

Definition 2. The space \(\mathscr{S}(\Sigma)\) of smoothing functions for \(\Sigma\) is the space of \(C^{1}\) functions \(f: \Sigma \rightarrow \mathbb{R}\) satisfying the property that the function on \(f+q_{\Sigma}\) is infinitely differentiable.

It follows immediately from the definition that \(\mathscr{S}(\Sigma)\) is invariant under addition of smooth functions, which will be used in the next result:

Lemma 2. The space of smoothing functions \(\mathscr{S}(\Sigma)\) depends only on \(L\) (and not on the splitting of the projection \(\mathbb{R}^{4} \rightarrow L^{\vee}\) ).

Proof. A different choice of complementary subspaces correspond to adding a quadratic form \(q^{\prime}\) to \(q_{i j}\), and the corresponding smooth function on \(\Sigma\) to \(q_{\Sigma}\).

We shall now associate a graphical Lagrangian to each smoothing function: the construction relies on the fact that the union of all translates of \(L\) passing through a face of \(\Sigma\) is canonically symplectomorphic to the cotangent bundle of \(\Sigma\), with the cotangent fibre at \(z \in \Sigma\) corresponding to the translate of \(L\) passing through \(z\). In this way, a smoothing function \(f\) determines a Lagrangian \(\Lambda_{d f} \subset \mathbb{R}^{4}\), piecewise as the graph of the restriction of the differential \(d f\) to each face.

Lemma 3. The assignment \(f \mapsto \Lambda_{d f}\) determines a bijective correspondence between graphical Lagrangians and smoothing functions on \(\Sigma\) up to addition of constants.

Proof. In terms of the polarization from the discussion preceding Definition 2, the Lagrangian \(\Lambda_{d f}\) corresponds to the graph of the differential of the function \(f+q_{\Sigma}\) considered as a function on \(L^{\vee}\) via the projection map, because each face of \(\Sigma\) is the graph of \(d q_{i j}\). The result now follows from the fact that graphical Lagrangians over \(L^{\vee}\) are graphs of differentials of smooth functions.

Note that while the proof uses the polarization, the construction does not. As in Lemma 2, we conclude that this bijection depends only on the choice of Lagrangian \(L\).

The above completes our local analysis near vertices. Near edges, the analysis is much simpler:

Lemma 4. If \(\Sigma\) consists of a pair of linear Lagrangian half-planes in \(\mathbb{R}^{4}\) meeting along a line \(\ell\), then the space of Lagrangian subspaces \(L\), satisfying the property that the symplectic pairing \(\Sigma \rightarrow L^{\vee}\) is a homeomorphism, is contractible.

Proof. The submanifold \(\Sigma\) is equivalent by (affine) linear symplectic transformations to the symplectic product of the real axis in an \(\mathbb{R}^{2}\) factor with the piecewise Lagrangian consisting of the positive axes in another. If the projection \(\Sigma \rightarrow L^{\vee}\) is a homeomorphism, then \(L\) must be transverse to both Lagrangian half-planes comprising \(\Sigma\). This implies that the symplectic reduction of \(L\) along \(\ell\) (i.e. the image under the quotient by \(\ell\) of the intersection of \(L\) with the symplectic annihilator \(\ell^{\perp}\) ) is a line transverse to two coordinate lines in \(\ell^{\perp} / \ell \cong \mathbb{R}^{2}\), and \(\Sigma\) projects homeomorphically to \(L^{\vee}\) if and only if this reduction intersects the interior of the positive quadrant, which is a contractible condition. The argument is completed by noting that the space of Lagrangian lifts of a line \(\ell^{\prime}\) in \(\mathbb{R}^{2}\) is contractible: any two lifts to \(\ell^{\perp}\) differ by the graph of a map from \(\ell^{\prime}\) to \(\ell\), and \(L\) is determined up to contractible choice by \(L \cap \ell^{\perp}\), since it must lie in the symplectic orthogonal of this line, and the space of planes in \(\mathbb{R}^{3}\) containing a given line (in this case \(L \cap \ell^{\perp}\) ) and avoiding another line (in this case \(\ell\) ) is contractible.

Extending Definitions 2 and 3 verbatim to the case of a pair of edges, we obtain the analogue of Lemma 3, using a splitting into factors as in the above proof.

In the global setting, we cannot work with translates with a single Lagrangian, so we need to consider a family \(L_{z}\) of Lagrangian planes, passing through each point \(z \in \Sigma\), which are not necessarily translates of each other. We shall require four properties of such a family, the first three of which are easy to state:
1. \(L_{z}\) consists of translates of a single Lagrangian near the origin.
2. \(L_{z}\) varies smoothly along the edges.
3. \(L_{z}\) varies smoothly along the faces.

To formulate the last property, say that \(\sigma\) and \(\sigma^{\prime}\) are faces meeting along an edge \(\tau\), and let \(z\) be a point on \(\tau\). The choice of \(L_{z}\) determines an identification
\[
T_{z} \sigma \cong L_{z}^{\vee} \cong T_{z} \sigma^{\prime}
\]
which is compatible with the inclusion of \(T_{z} \tau\) on both sides. A matched normal field along \(\tau\) is a choice of sections of \(\left.T \sigma\right|_{\tau}\) and \(\left.T \sigma^{\prime}\right|_{\tau}\) which are inward pointing, and are opposite vectors under the above identification. For simplicity, we require this normal field, at the origin \(\tau\), to point along the direction of the edge of \(\sigma\) (or \(\sigma^{\prime}\) ) which meets \(\tau\). Because the faces of \(\Sigma\) are flat, this choice therefore determines an embedding \(\tau \times[0, \epsilon) \rightarrow \sigma\), which is a collar neighbourhood (and similarly for \(\sigma^{\prime}\) ).

Definition 3. A conormal fibration dual to \(\Sigma\) is a family \(L_{z}\) of (affine)-linear Lagrangian planes in \(\mathbb{R}^{4}\), parametrised by \(z \in \Sigma\), satisfying the above three properties and so that, in a collar of each edge, the Lagrangians in the normal direction are translates of the Lagrangians along the edge.

The choice of collars in the above construction determines a smooth structure on \(\Sigma\) by using negative coordinates on one of the collars as well as the identification \((-\epsilon, 0] \cup[0, \epsilon) \cong(-\epsilon, \epsilon)\). This is an a priori different way of constructing a smooth structure than our earlier formulation, and the next result asserts the compatibility of these contructions; in this setting, we choose an affine-linear Lagrangian \(\Lambda_{z}\) passing through \(z\), which is transverse to \(L_{z}\), and consider the (locally defined) map from \(\Sigma\) to \(\Lambda_{z}\) which assigns to \(z^{\prime} \in \Sigma\) near \(z\) the intersection points \(L_{z^{\prime}} \cap \Lambda_{z}\) which is unique because \(L_{z}\) is close to \(L_{z^{\prime}}\).

Lemma 5. The projection map to \(\Lambda_{z}\) is a local diffeomorphism.
Proof. The only case that needs to be discussed is when \(z\) lies on an edge \(\tau\). The condition that \(L_{z^{\prime}}\) be given by translates along the collar direction implies that this map may be written along the collar of \(\tau\) in a face \(\sigma\) as \((t, s) \mapsto \gamma(t)+s \cdot \nu_{\sigma}(t)\), where \(t\) is the coordinate along \(\tau\) and \(s \in[0, \epsilon)\) is the coordinate in the normal direction. The requirement that the normal fields are matched is equivalent to the condition that \(\nu_{\sigma}=-\nu_{\sigma^{\prime}}\) if \(\sigma\) and \(\sigma^{\prime}\) are the two faces meeting along \(\tau\). The smoothness of the map is immediate from this description.

Whenever the family \(L_{z}\) does not consist of translates, the Lagrangians \(L_{z}\) will have non-empty intersections. However, such intersections always take place outside some open neighbourhood \(\nu \Sigma\) of \(\Sigma\), which we now fix. As before, the fibration \(L_{z}\) determines a projection \(\nu \Sigma \rightarrow \Sigma\). We say that a Lagrangian is graphical with respect to \(L_{z}\) if it is contained in this neighbourhood, and its projection to \(\Sigma\) is a diffeomorphism.

Lemma 6. Every graphical Lagrangian with respect to \(L_{z}\) arises as the graph of a smoothing function. Moreover, any smoothing function whose differential is sufficiently small defines a graphical Lagrangian.

Proof. The correspondence between graphical Lagrangians and smoothing functions is local on \(\Sigma\). It thus suffices to consider a point \(z \in \Sigma\), and observe that a Lagrangian plane \(L_{z}^{\vee}\) which is transverse to \(L_{z}\) at \(z\) will also be transverse to nearby fibres, so that a neighbourhood of \(z\) in \(\nu \Sigma\) is modelled after the conormal bundle of \(L_{z}^{\vee}\), by Weinstein's tubular neighbourhood theorem. The result then follows by the standard construction of Lagrangians as graphs of closed 1 -forms.

In order for the previous result to be helpful, we need to be able to produce the desired functions; this is not completely obvious because the space of smoothing functions in not invariant under rescaling:

Lemma 7. There exist smoothing functions of arbitrarily small \(C^{1}\)-norm.
Proof. As a preliminary step, choose a partition of unity \(\sum_{\sigma} \chi_{\sigma}=1\) on \(\Sigma\), of bounded \(C^{k}\)-norms for all \(k\), indexed by the strata of \(\Sigma\), so that \(\chi_{\sigma}\) vanishes outside a small neighbourhood of \(\sigma\) and its restriction to \(\sigma\) is identically 1 in the complement of a small neighbourhood of the boundary of \(\sigma\). If \(\chi_{\sigma}^{\epsilon}\) is the composition of \(\chi_{\sigma}\) with the dilation of the plane by \(1 / \epsilon\), we obtain a family of partitions of unity which are uniformly bounded, and whose \(C^{1}\)-norms are bounded by a constant multiple of \(1 / \epsilon\).

We now choose a Lagrangian plane \(\Lambda_{\sigma}\) which contains each stratum \(\sigma \subset \Sigma\), and which is transverse to \(L\), and let \(f_{\sigma}\) denote the corresponding smoothing function. Note that the tangency
conditions imply that the functions \(f_{\sigma}\) and \(f_{\sigma^{\prime}}\) agree to first order along \(\sigma \cap \sigma^{\prime}\). Let \(f^{\epsilon}\) denote the function \(\sum \chi_{\sigma}^{\epsilon} f_{\sigma}\). The fact that \(f_{\sigma}^{\epsilon}\) is a family of smoothing functions follows from the partition of unity, and the fact that the \(C^{1}\)-norm is bounded follows from the product rule and the observation that, while the norm of the gradient of \(\chi_{\sigma}^{\epsilon}\) grows like \(1 / \epsilon\), it is supported in a region where the difference between \(f_{\sigma}\) and \(f_{\sigma^{\prime}}\) is bounded by a constant multiple of \(\epsilon^{2}\).

We now proceed with the global part of the argument, and thus return to the setting where \(K\) is a polyhedral Lagrangian surface in \(\mathbb{R}^{4}\). The first step is to globalise the choice of \(L\) :

Definition 4. A conormal fibration dual to \(K\) is a smoothly varying family \(L_{z}\) of (affine)-linear Lagrangian planes in \(\mathbb{R}^{4}\), parametrised by \(z \in K\), which locally satisfies the properties from Definition 3.

Lemma 8. The surface \(K\) admits a dual conormal fibration which, near vertex, agrees with the choice given by Corollary 1 .

Proof. Lemma 4 implies that the choices near the vertices may be extended to the edges. Choosing a normal vector field to one of the faces that meets along an edge determines matched normals, and the extension to the interior of the faces is then standard, as the space of Lagrangian planes transverse to a given one is contractible.

The conormal fibration determines a subset \(\mathscr{S}(K)\) of the space of \(C^{1}\)-functions consisting of those functions which are smooth in the interior of each face, and which are smoothing functions in the sense of Definition 2 near each edge and vertex.

Lemma 9. There exist smoothing functions for \(K\) of arbitrarily small \(C^{1}\)-norm.
Proof. Choose a partition of unity \(\sum_{\alpha} \rho_{\alpha}=1\) on \(K\), indexed by the strata of \(K\), so that \(\rho_{\alpha}\) is supported in the open star of \(\alpha\) (the union of all strata adjacent to it). Lemma 7 asserts the existence of smoothing functions \(f_{\alpha}\) of arbitrarily small \(C^{1}\)-norm defined on the open star of \(\alpha\). The function \(\sum_{\alpha} \rho_{\alpha} f_{\alpha}\) satisfies the desired property.

We now arrive at the proof of the main result, which mostly consists of assembling together all the previous steps:

Proof of Proposition 1 We have a neighbourhood \(\nu K\) of \(K\) in \(\mathbb{R}^{4}\) in which the conormal fibres \(L_{z}\) are disjoint. The statement of Lemma 6 and its proof apply verbatim to this space, replacing \(K\) by \(\Sigma\). The existence of sufficiently many global smoothing functions is guaranteed by Lemma 9 .

As a consequence, we obtain a sequence \(K_{i}\) of smooth embedded Lagrangians, which are all isotopic to \(K\) by a piecewise smooth isotopy and converge to it, that are moreover graphs of differentials of smooth functions (over each other) with respect to the fibration \(\left\{L_{z}\right\}\). This graphical description yields a smooth Hamiltonian path of graphical Lagrangians connecting \(K_{i}\) to \(K_{i+1}\), and smoothing the concatenation of these paths yields the desired result.

\section*{B.8.1 References}
[1] M. W. Hirsch. Differential Topology. Graduate Texts in Mathematics. Springer, 1976.
[2] D. McDuff and D. Salamon. Introduction to Symplectic Topology. Oxford Mathematical Monographs. Oxford University Press, third edition, 2017.

\section*{B. 9 Question 9: Joe Kileel}

Authors: Work by D. Miao, G. Lerman, J. Kileel
Yes, such algebraic relations do exist. Assemble the various tensors \(\left\{Q^{(\alpha \beta \gamma \delta)}: \alpha, \beta, \gamma, \delta \in[n]\right\}\) into one tensor \(\mathbf{Q} \in \mathbb{R}^{3 n \times 3 n \times 3 n \times 3 n}\), thought of as an \(n \times n \times n \times n\) block tensor where the \((\alpha, \beta, \gamma, \delta)\) block is \(Q^{(\alpha \beta \gamma \delta)} \in \mathbb{R}^{3 \times 3 \times 3 \times 3}\). Let \(\mathbf{F}\) be the polynomial map sending \(\left\{Q^{(\alpha \beta \gamma \delta)}: \alpha, \beta, \gamma, \delta \in[n]\right\}\) to the \(5 \times 5\) minors of the four \(3 n \times 27 n^{3}\) matrix flattenings of \(\mathbf{Q}\). We will prove that \(\mathbf{F}\) satisfies the desired properties.

A key point is to discover the following algebraic identity.
Lemma 1. Consider \(\mathbf{Q} \in \mathbb{R}^{3 n \times 3 n \times 3 n \times 3 n}\) as above. It admits a Tucker tensor decomposition
\[
\mathbf{Q}=\mathcal{C} \times_{1} \mathbf{A} \times_{2} \mathbf{A} \times_{3} \mathbf{A} \times_{4} \mathbf{A},
\]
for \(\mathcal{C} \in \mathbb{R}^{4 \times 4 \times 4 \times 4}\) and \(\mathbf{A} \in \mathbb{R}^{3 n \times 4}\). Explicitly, we can take
\[
\mathcal{C}_{a b c d}= \begin{cases}\operatorname{sgn}(a b c d) & \text { if } a, b, c, d \in[4] \text { are distinct } \\ 0 & \text { otherwise },\end{cases}
\]
where \(s g n\) is parity of a permutation, and \(\mathbf{A}\) to be the vertical concatenation \(\left[A^{(1)} ; \ldots ; A^{(n)}\right]\).
Proof. Let \([n] \times[3]\) stand for the indices of \(\mathbf{Q}\) in each mode and for the row indices of \(\mathbf{A}\). By definition of Tucker product, for all \((\alpha, i),(\beta, j),(\gamma, k),(\delta, \ell) \in[n] \times[3]\) we have
\[
\begin{aligned}
& \left(\mathcal{C} \times_{1} \mathbf{A} \times_{2} \mathbf{A} \times_{3} \mathbf{A} \times_{4} \mathbf{A}\right)_{(\alpha, i),(\beta, j),(\gamma, k),(\delta, \ell)} \\
& =\sum_{a, b, c, d \in[4]} \mathcal{C}_{a b c d} \mathbf{A}_{(\alpha, i), a} \mathbf{A}_{(\beta, j), b} \mathbf{A}_{(\gamma, k), c} \mathbf{A}_{(\delta, \ell), d} \\
& =\sum_{a, b, c, d \in[4] \text { distinct }} \operatorname{sgn}(a b c d) A_{i a}^{(\alpha)} A_{j b}^{(\beta)} A_{k c}^{(\alpha)} A_{\ell d}^{(\alpha)} \\
& =\operatorname{det}\left[A^{(\alpha)}(i,:) ; A^{(\beta)}(j,:) ; A^{(\gamma)}(k,:) ; A^{(\delta)}(\ell,:)\right] \\
& =Q_{i j k \ell}^{(\alpha \beta \gamma \delta)}=\mathbf{Q}_{(\alpha, i),(\beta, j),(\gamma, k),(\delta, \ell)}
\end{aligned}
\]

The lemma explains why \(\mathbf{F}\) captures algebraic relations between the tensors \(\left\{Q^{(\alpha \beta \gamma \delta)}\right.\) : \(\alpha, \beta, \gamma, \delta \in[n]\}\). Indeed, the block tensor \(\mathbf{Q}\) has multilinear rank bounded by ( \(4,4,4,4\) ) due to the Tucker decomposition in (B.1). Therefore, all \(5 \times 5\) minors in \(\mathbf{F}\) vanish.

Below we break up the proof of the third property into two directions. The other properties are clear. Throughout the proof, for \(\lambda \in \mathbb{R}^{n \times n \times n \times n}\) we let \(\lambda \odot_{b} \mathbf{Q} \in \mathbb{R}^{3 n \times 3 n \times 3 n \times 3 n}\) denote blockwise scalar multiplication, i.e., the \((\alpha, \beta, \gamma, \delta)\)-block of \(\lambda \odot_{b} \mathbf{Q}\) is \(\lambda_{\alpha \beta \gamma \delta} Q^{(\alpha \beta \gamma \delta)} \in \mathbb{R}^{3 \times 3 \times 3 \times 3}\). Roughly speaking, we need to show that a blockwise scaling of Q preserves multilinear rank if and only if the scaling is a rank-1 tensor off the diagonal.
"If" Direction This follows easily from Lemma 1. Assume \(\lambda \in \mathbb{R}^{n \times n \times n \times n}\) agrees off-diagonal with \(u \otimes v \otimes w \otimes x\) for \(u, v, w, x \in\left(\mathbb{R}^{*}\right)^{n}\) and is 0 on the diagonal. Then
\[
\lambda \odot_{b} \mathbf{Q}=(u \otimes v \otimes w \otimes x) \odot_{b} \mathbf{Q}
\]
because the diagonal blocks of \(\mathbf{Q}\) vanish. That is, \(Q^{(\alpha \alpha \alpha \alpha)}=0\) since each entry of \(Q^{(\alpha \alpha \alpha \alpha)}\) is the determinant of a matrix with a repeated row. Note that blockwise scalar product with a rank-1 tensor with nonzero entries is equivalent to Tucker product with invertible matrices:
\[
(u \otimes v \otimes w \otimes w) \odot_{b} \mathbf{Q}=\mathbf{Q} \times_{1} D_{u} \times_{2} D_{v} \times_{3} D_{w} \times_{4} D_{x}
\]

Here \(D_{u} \in \mathbb{R}^{3 n \times 3 n}\) is the diagonal matrix triplicating the entries of \(u\) and likewise for \(D_{v}, D_{w}, D_{x}\). Thus \(\lambda \odot_{b} \mathbf{Q}\) and \(\mathbf{Q}\) have the same multilinear rank, and from the lemma \(\mathbf{F}\left(\lambda_{\alpha \beta \gamma \delta} Q^{(\alpha \beta \gamma \delta)}: \alpha, \beta, \gamma, \delta \in\right. [n])=0\).
"Only If" Direction The converse takes more work. Let \(\lambda \in \mathbb{R}^{n \times n \times n \times n}\) have nonzero entries precisely off the diagonal and assume \(\mathbf{F}\left(\lambda_{\alpha \beta \gamma \delta} Q^{(\alpha \beta \gamma \delta)}: \alpha, \beta, \gamma, \delta \in[n]\right)=0\). We further assume \(\lambda_{\alpha 111}=\lambda_{1 \beta 11}=\lambda_{11 \gamma 1}=\lambda_{111 \delta}=1\) for all \(\alpha, \beta, \gamma, \delta \in\{2, \ldots, n\}\). We reduce to this case by replacing \(\lambda\) by its entrywise product with \(\bar{u} \otimes \bar{v} \otimes \bar{w} \otimes \bar{x}\), where
\[
\bar{u}_{\alpha}= \begin{cases}1 & \text { for } \alpha=1 \\ \lambda_{\alpha 111}^{-1} & \text { for } \alpha \in\{2, \ldots, n\},\end{cases}
\]
and \(\bar{v}, \bar{w}, \bar{x}\) are defined similarly using the second, third and fourth modes respectively. The replacement preserves the multilinear rank of \(\lambda \odot_{b} \mathbf{Q}\) and whether or not \(\lambda\) agrees off-diagonal with a rank-1 tensor. Hence it is without loss of generality.

Through some explicit calculations, we will prove there exists \(c \in \mathbb{R}^{*}\) such that
- \(\lambda_{\alpha \beta \gamma \delta}=c\) if exactly two of \(\alpha, \beta, \gamma, \delta\) equal 1
- \(\lambda_{\alpha \beta \gamma \delta}=c^{2}\) if exactly one of \(\alpha, \beta, \gamma, \delta\) equals 1
- \(\lambda_{\alpha \beta \gamma \delta}=c^{3}\) if none of \(\alpha, \beta, \gamma, \delta\) equal 1 and \(\alpha, \beta, \gamma, \delta\) are not identical.

This will establish the "only if" direction, as setting \(u=v=w=(1, c, \ldots, c)\) and \(x= \left(\frac{1}{c}, 1, \ldots, 1\right)\) gives \(\lambda_{\alpha \beta \gamma \delta}=u_{\alpha} v_{\beta} w_{\gamma} x_{\delta}\) whenever \(\alpha, \beta, \gamma, \delta\) are not identical. Our proof strategy is to examine appropriate coordinates of \(\mathbf{F}\left(\lambda_{\alpha \beta \gamma \delta} Q^{(\alpha \beta \gamma \delta)}: \alpha, \beta, \gamma, \delta \in[n]\right)=0\) in order to constrain \(\lambda\). Equivalently, we will consider the vanishing of the determinants of certain well-chosen \(5 \times 5\)
submatrices of the flattenings of \(\lambda \odot_{b} \mathbf{Q}\). Write \(\mathbf{Q}_{(1)}\) and \(\left(\lambda \odot_{b} \mathbf{Q}\right)_{(1)}\) for mode-1 flattenings in \(\mathbb{R}^{3 n \times 27 n^{3}}\). Rows correspond to the first tensor mode and are indexed by \((\alpha, i) \in[n] \times[3]\), while columns correspond to the other modes and are indexed by \(((\beta, j),(\gamma, k),(\delta, \ell)) \in([n] \times[3])^{3}\).

Step 1: The first submatrix of \(\left(\lambda \odot_{b} \mathbf{Q}\right)_{(1)}\) we consider has column indices \(((\alpha, 1),(1,3),(1,2))\), \(((1, \overline{2}),(\beta, 2),(1,1)),((1,2),(\beta, 3),(1,1)),((1,3),(\beta, 3),(1,2)),((1,1),(\beta, 1),(1,3))\) and row indices \((1,1),(1,2),(1,3),(\alpha, 1),(\alpha, 2)\), where \(\alpha, \beta \in\{2, \ldots, n\}\). Explicitly, the submatrix is
\[
\left[\begin{array}{ccccc}
Q_{1132}^{(1 \alpha 11)} & Q_{1221}^{(11 \beta 1)} & Q_{1231}^{(11 \beta 1)} & Q_{1332}^{(11 \beta 1)} & Q_{1113}^{(11 \beta 1)} \\
Q_{2132}^{(1 \alpha 11)} & Q_{2221}^{(11 \beta 1)} & Q_{2231}^{(11 \beta 1)} & Q_{2332}^{(11 \beta 1)} & Q_{2113}^{(11 \beta 1)} \\
Q_{3132}^{(1 \alpha 11)} & Q_{3221}^{(11 \beta 1)} & Q_{3231}^{(11 \beta 1)} & Q_{3332}^{(11 \beta 1)} & Q_{3113}^{(11 \beta 1)} \\
\lambda_{\alpha \alpha 11} Q_{1132}^{(\alpha \alpha 11)} & \lambda_{\alpha 1 \beta 1} Q_{1221}^{(\alpha 1 \beta 1)} & \lambda_{\alpha 1 \beta 1} Q_{1231}^{(\alpha 1 \beta 1)} & \lambda_{\alpha 1 \beta 1} Q_{1332}^{(\alpha 1 \beta 1)} & \lambda_{\alpha 1 \beta 1} Q_{1113}^{(\alpha 1 \beta 1)} \\
\lambda_{\alpha \alpha 11} Q_{2132}^{(\alpha \alpha 11)} & \lambda_{\alpha 1 \beta 1} Q_{2221}^{(\alpha 1 \beta 1)} & \lambda_{\alpha 1 \beta 1} Q_{2231}^{(\alpha 1 \beta 1)} & \lambda_{\alpha 1 \beta 1} Q_{2332}^{(\alpha 1 \beta 1)} & \lambda_{\alpha 1 \beta 1} Q_{2113}^{(\alpha 1 \beta 1)}
\end{array}\right]
\]
which we abbreviate as
\[
\left[\begin{array}{ccccc}
* & * & * & * & * \\
* & * & * & * & * \\
* & * & * & * & * \\
\lambda_{\alpha \alpha 11}^{*} & \lambda_{\alpha 1 \beta 1}^{*} & \lambda_{\alpha 1 \beta 1}^{*} & \lambda_{\alpha 1 \beta 1}^{*} & \lambda_{\alpha 1 \beta 1}^{*} \\
\lambda_{\alpha \alpha 11}^{*} & \lambda_{\alpha 1 \beta 1}^{*} & \lambda_{\alpha 1 \beta 1}^{*} & \lambda_{\alpha 1 \beta 1}^{*} & \lambda_{\alpha 1 \beta 1}^{*}
\end{array}\right]
\]
with asterisk denoting the corresponding entry in \(\mathbf{Q}_{(1)}\). We view the determinant of (B.2) as a polynomial with respect to \(\lambda\). It has degree \(\leq 2\) in the variables \(\lambda_{\alpha \alpha 11}, \lambda_{\alpha 1 \beta 1}\). Observe that if \(\lambda_{\alpha 1 \beta 1}=0\), the bottom two rows of the matrix are linearly independent. Also if \(\lambda_{\alpha 1 \beta 1}-\lambda_{\alpha \alpha 11}=0\), then (B.2) equals a \(5 \times 5\) submatrix of \(\mathbf{Q}_{(1)}\) with rows operations performed; therefore (B.2) is rank-deficient. It follows that the determinant of (B.2) takes the form
\[
s \lambda_{\alpha 1 \beta 1}\left(\lambda_{\alpha 1 \beta 1}-\lambda_{\alpha \alpha 11}\right)
\]

Here the scale \(s=s\left(A^{(1)}, A^{(\alpha)}, A^{(\beta)}\right)\) is a polynomial in the \(A\)-matrices. Due to polynomiality, \(s\) is nonzero Zariski-generically if we can exhibit a single instance of matrices \(A^{(1)}, A^{(\alpha)}, A^{(\beta)}\) where the determinant of (B.2) does not vanish identically for all \(\lambda_{\alpha 1 \beta 1}, \lambda_{\alpha \alpha 11}\). Furthermore, we just need an instance with \(\alpha=\beta\), as this corresponds to a specialization of the case \(\alpha \neq \beta\). Computational verification with a random numerical instance of \(A^{(1)}, A^{(\alpha)}\) proves the non-vanishing (see attached code). Recalling the standing assumptions, we deduce \(\lambda_{\alpha 1 \beta 1}=\lambda_{\alpha \alpha 11}\).

We apply the same argument to modewise permutations of \(\lambda \odot_{b} \mathbf{Q}\) and \(\mathbf{Q}\), and obtain
\[
\lambda_{\pi(\alpha 1 \beta 1)}=\lambda_{\pi(\alpha \alpha 11)} \quad \text { for all } \alpha, \beta \in\{2, \ldots, n\} \text { and permutations } \pi .
\]

The argument goes through as \(\pi \cdot \mathbf{Q}\) and \(\pi \cdot\left(\lambda \odot_{b} \mathbf{Q}\right)\) have multilinear ranks bounded by ( \(4,4,4,4\) ) and \(\pi \cdot \mathbf{Q}=\operatorname{sgn}(\pi) \mathbf{Q}\). So (B.2) looks the same but with indices permuted and possibly a sign flip.

We now see that \(\lambda\)-entries with two 1 -indices agree. Indeed, taking \(\alpha=\beta\) above gives \(\lambda_{\pi_{1}(\alpha 1 \alpha 1)}=\lambda_{\pi_{2}(\alpha \alpha 11)}\) for all \(\pi_{1}\) and \(\pi_{2}\) that fix ( \(\alpha \alpha 11\) ) and ( \(\alpha 1 \alpha 1\) ) respectively. So, \(\lambda_{\alpha \alpha 11}=\lambda_{\pi(\alpha \alpha 11)}\)
for all \(\pi\). Taking \(\alpha \neq \beta\) gives \(\lambda_{\alpha \alpha 11}=\lambda_{\pi(\alpha 1 \beta 1)}=\lambda_{\beta \beta 11}\) for all \(\pi\). Together, there exists \(c \in \mathbb{R}^{*}\) such that \(c=\lambda_{\pi(\alpha \beta 11)}\) for all \(\alpha, \beta \in\{2, \ldots, n\}\) and permutations \(\pi\).

Step 2: Next we consider the submatrix of \(\left(\lambda \odot_{b} \mathbf{Q}\right)_{(1)}\) with column indices \(((\beta, 1),(\gamma, 3),(1,2))\), \(((1, \overline{2}),(\beta, 2),(1,1)),((1,2),(\beta, 3),(1,1)),((1,3),(\beta, 3),(1,2)),((1,1),(\beta, 1),(1,3))\) and row indices \((1,1),(1,2),(1,3),(\alpha, 1),(\alpha, 2)\), where \(\alpha, \beta, \gamma \in\{2, \ldots, n\}\). It looks like
\[
\left[\begin{array}{ccccc}
c * & * & * & * & * \\
c * & * & * & * & * \\
c * & * & * & * & * \\
\lambda_{\alpha \beta \gamma 1} * & c * & c * & c * & c * \\
\lambda_{\alpha \beta \gamma 1} * & c * & c * & c * & c *
\end{array}\right]
\]
where asterisks denote corresponding entries in \(\mathbf{Q}_{(1)}\). As a polynomial in \(c\) and \(\lambda_{\alpha \beta \gamma 1}\), the determinant of (B.3) is a scalar multiple of \(c\left(c^{2}-\lambda_{\alpha \beta \gamma 1}\right)\). This is because the polynomial has degree \(\leq 3\), if \(c=0\) then the bottom two rows of (B.3) are linearly dependent, and if \(c^{2}=\lambda_{\alpha \beta \gamma 1}\) then (B.3) is a \(5 \times 5\) submatrix of \(\mathbf{Q}_{(1)}\) with row and column operations performed. The scale is a polynomial in \(A^{(1)}, A^{(\alpha)}, A^{(\beta)}, A^{(\gamma)}\). It is Zariski-generically nonzero if we exhibit one instance of \(A\)-matrices such that the determinant of B.2) does not vanish for all \(c, \lambda_{\alpha \beta \gamma 1}\). Further, it suffices to find an instance where \(\alpha=\beta=\gamma\), as all other cases specialize to this. Computational verification with a random numerical instance of \(A^{(1)}, A^{(\alpha)}\) proves the non-vanishing. It follows that \(c^{2}=\lambda_{\alpha \beta \gamma 1}\). Appealing to symmetry like before, \(c^{2}=\lambda_{\pi(\alpha \beta \gamma 1)}\) for all \(\alpha, \beta, \gamma \in\{2, \ldots, n\}\) and permutations \(\pi\). Summarizing, all \(\lambda\)-entries with a single 1 -index equal \(c^{2}\).

Step 3: Consider the submatrix of \((\lambda \odot \mathbf{Q})_{(1)}\) with columns \(((\beta, 1),(\gamma, 3),(\delta, 2)),((1,2),(\alpha, 2)\), \((1,1)),((1,2),(\alpha, 3),(1,1)),((1,3),(\alpha, 3),(1,2)),((1,1),(\alpha, 1),(1,3))\) and rows \((1,1),(1,2)\), \((1,3),(\alpha, 1),(\alpha, 2)\), where \(\alpha, \beta, \gamma, \delta \in\{2, \ldots, n\}\) and \(\alpha, \delta\) are distinct. The submatrix looks like
\[
\left[\begin{array}{ccccc}
c^{2} * & * & * & * & * \\
c^{2} * & * & * & * & * \\
c^{2} * & * & * & * & * \\
\lambda_{\alpha \beta \gamma \delta}^{*} & c * & c * & c * & c * \\
\lambda_{\alpha \beta \gamma \delta}^{*} & c * & c * & c * & c *
\end{array}\right]
\]

The determinant of (B.4) is \(c\left(c^{3}-\lambda_{\alpha \beta \gamma \delta}\right)\) multiplied by a polynomial in \(A^{(1)}, A^{(\alpha)}, A^{(\beta)}, A^{(\gamma)}, A^{(\delta)}\). The most specialized case is \(\alpha=\beta=\gamma\). Computer verification with a random numerical instance proves the polynomial is not identically zero. We deduce that \(c^{3}=\lambda_{\alpha \beta \gamma \delta}\). By symmetry, \(c^{3}=\lambda_{\pi(\alpha \beta \gamma \delta)}\) for all \(\alpha, \beta, \gamma, \delta \in\{2, \ldots, n\}\) with \(\alpha, \delta\) distinct and all permutations \(\pi\). In other words, \(\lambda\)-entries with no 1 -indices and non-identical indices equal \(c^{3}\).

Steps 1, 2 and 3 show that \(\lambda\) takes the announced form. So, \(\lambda\) is rank-1 off the diagonal. This finishes the "only if" direction. Overall, we have proven that the \(5 \times 5\) minors of the \(3 n \times 27 n^{3}\) flattenings of \(\mathbf{Q}\) give algebraic relations on \(\left\{Q^{(\alpha \beta \gamma \delta)}: \alpha, \beta, \gamma, \delta \in[n]\right\}\) with the desired properties.

\section*{B. 10 Question 10: Tammy Kolda}

Authors: Johannes Brust and Tamara G. Kolda

\section*{Title: Fast and Accurate CP-HIFI Solution}

The system to be solved is
\[
\left[(Z \otimes K)^{T} S S^{T}(Z \otimes K)+\lambda\left(I_{r} \otimes K\right)\right] \operatorname{vec}(W)=\left(I_{r} \otimes K\right) \operatorname{vec}(B) .
\]

We consider several approaches for solving Equation (B.1) in the remainder of this subsection. We present a direct method for the symmetric linear system in Section B.10.1, using an additional regularization term. In Section B.10.2, we present a transformation of the symmetric system based on the eigendecomposition of \(K\). In Section B.10.4, we present an iterative method based on the transformed symmetric system, adding some regularization akin to the symmetric direct method. In Table 1 and Section B.10.5, we provide an accounting of the costs and comparison of direct and iterative methods.

\section*{B.10.1 Direct Solution of UI Subproblem (Symmetric Form)}

Equation (B.1) is an indefinite symmetric linear system of size \(r n \times r n\). Since it is indefinite, we add a regularization term parameterized by \(\rho>0\) to ensure positive definiteness. The modified system is
\[
\left[F^{T} F+\lambda\left(I_{r} \otimes K\right)+\rho I_{r n}\right] \operatorname{vec}(W)=\operatorname{vec}(K B),
\]
where \(F=S^{T}(Z \otimes K)\). Observe that we have pulled \(K\) inside the vectorization on the right-hand side.

To compute \(F\), we want to avoid forming the \(N \times n r\) Kronecker product \(Z \otimes K\) explicitly. Instead, we create two special matrices: \(\hat{K} \in \mathbb{R}^{q \times n}\) and \(\hat{Z} \in \mathbb{R}^{q \times r}\). Each index \(\ell \in[q]\) corresponds to a known entry index that we denote as \(\left(i_{1}^{(\ell)}, i_{2}^{(\ell)}, \ldots, i_{d}^{(\ell)}\right) \in \Omega\). Then, for each \(\ell \in[q]\), we let
\[
\begin{aligned}
& \hat{Z}(\ell,:)=\left(A_{d}\left(i_{d}^{(\ell)},:\right) * \cdots * A_{k+1}\left(i_{k+1}^{(\ell)},:\right) * A_{k-1}\left(i_{k-1}^{(\ell)},:\right) * \cdots * A_{1}\left(i_{1}^{(\ell)},:\right)\right)^{T}, \text { and } \\
& \hat{K}(\ell,:)=K\left(i_{k}^{(\ell)},:\right) .
\end{aligned}
\]

Here, * represents elementwise multiplication. In other words, \(\hat{Z}\) and \(\hat{K}\) represent the subset of rows of \(Z\) and \(K\), respectively, that corresponds to the known entries of \(\mathcal{T}\). Then, row \(\ell\) of \(F\) is given by
\[
F(\ell,:)=\hat{Z}(\ell,:) \otimes \hat{K}(\ell,:) .
\]

\section*{B.10.2 Transforming the UI Subproblem}

We can exploit a factorization of \(K\) to transform Equation (B.1) into an equivalent but potentially better conditioned system. Assuming we have the eigendecomposition \(K=U D U^{T}\), we can rewrite Equation (B.1) by factoring out ( \(I_{r} \otimes U\) ) to obtain
\[
[\underbrace{(Z \otimes U D)^{T} S}_{\bar{F}^{T}} \underbrace{S^{T}(Z \otimes U D)}_{\bar{F}}+\lambda\left(I_{r} \otimes D\right)] \operatorname{vec}(\underbrace{U^{T} W}_{\bar{W}})=\operatorname{vec}(\underbrace{D U^{T} B}_{\bar{B}}) .
\]

Now we have a transformed system in the variable \(\bar{W}=U^{T} W\), and we can solve for \(W\) via \(W=U \bar{W}\) after solving the system. Note that we cannot pull \(D\) into the definition of \(\bar{W}\) because it is indefinite. We define \(\bar{F}:=S^{T}(Z \otimes U D) \in \mathbb{R}^{q \times r n}\), which is analogous to \(F\) with \(K\) replaced by \(U D\). We define \(\bar{B}:=D U^{T} B \in \mathbb{R}^{n \times r}\). Adding a regularization term as before, we obtain the modified system
\[
\left[\bar{F}^{T} \bar{F}+\lambda\left(I_{r} \otimes D\right)+\rho I_{r n}\right] \operatorname{vec}(\bar{W})=\operatorname{vec}(\bar{B})
\]

\section*{B.10.3 Key Lemmas for PCG Solution of UI Subproblem}

Before we continue to the details of solving Equation (B.7) via PCG, we present some key lemmas about working with matrices where each row is a Kronecker product of rows of two other matrices. These lemmas are important for efficiently computing the matrix-vector products and a preconditioner needed for PCG. We state these generically here so they can be reused in other contexts.

Let \(A \in \mathbb{R}^{q \times r}\) and \(B \in \mathbb{R}^{q \times n}\). Define the \(q \times r n\) matrix \(C\) row-wise as
\[
C(\ell,:)=A(\ell,:) \otimes B(\ell,:), \quad \text { for } \quad \ell=1, \ldots, q .
\]

Recall that for the Kronecker product of an \(n\)-vector and an \(r\)-vector, or for the vectorization of an \(n \times r\) matrix, there is a correspondence between \(k \in[r n]\) and the pair \((i, j)\) with \(i \in[n]\) and \(j \in[r]\) such that \(k=i+(j-1) n\). For the Kronecker product, this means \(C_{\ell k}=B_{\ell i} A_{\ell j}\). For a vectorized matrix, we have \((\operatorname{vec}(X))_{k}=X_{i j}\).

Lemma 1 shows how to compute the matrix-vector product \(C x\) efficiently. This would normally cost \(\mathcal{O}(q r n)\) if we formed \(C\) explicitly. However, using the structure of \(C\), we can compute it using only \(\mathcal{O}(q(r+n))\) operations. Moreover, we avoid forming \(C\) explicitly, which reduces the memory from \(\mathcal{O}(q r n)\) to \(\mathcal{O}(q(r+n))\).

Lemma 1. Given the setup in Equation (B.8), let \(X \in \mathbb{R}^{n \times r}\) be a matrix and define \(x=\operatorname{vec}(X)\). Then we have
\[
C x=(A * B X) 1_{r}
\]

Here \(1_{r}\) denotes the \(r\)-vector of all ones.
Proof. For all \(\ell=1, \ldots, q\) we have
\[
(C x)_{\ell}=\sum_{k=1}^{r n} C_{\ell k} x_{k}=\sum_{j=1}^{r} \sum_{i=1}^{n} B_{\ell i} X_{i j} A_{\ell j}=\sum_{j=1}^{r}(B X)_{\ell j} A_{\ell j}
\]

Lemma 2 shows how to compute the matrix-vector product \(C^{T} v\) without forming \(C\) explicitly. The cost is unchanged at \(\mathcal{O}(q r n)\), but the memory is reduced from \(\mathcal{O}(q r n)\) to \(\mathcal{O}(q(r+n))\).

Lemma 2. Given the setup in Equation (B.8) let \(v \in \mathbb{R}^{q}\). Then we have
\[
C^{T} v=\operatorname{vec}\left(B^{T} \operatorname{diag}(v) A\right)
\]

Proof. Define \(k=i+(j-1) n\) for \(i=1, \ldots, n\) and \(j=1, \ldots, r\). Then we have
\[
\left(C^{T} v\right)_{k}=\sum_{\ell=1}^{q} C_{\ell k} v_{\ell}=\sum_{\ell=1}^{q} B_{\ell i} A_{\ell j} v_{\ell}=\left(B^{T} \operatorname{diag}(v) A\right)_{i j}=\left(\operatorname{vec}\left(B^{T} \operatorname{diag}(v) A\right)\right)_{k}
\]

Lemma 3 shows how to compute the diagonal of \(C^{T} C\) efficiently. We reduce the computation from \(\mathcal{O}\left(q r^{2} n^{2}\right)\) to \(\mathcal{O}\left(q\left(r^{2}+n^{2}\right)\right)\) operations. Again, we avoid forming \(C\) explicitly, which reduces the memory from \(\mathcal{O}(q r n)\) to \(\mathcal{O}(q(r+n))\).
Lemma 3. Given the setup in Equation (B.8) Then
\[
\operatorname{diag}\left(C^{T} C\right)=\operatorname{vec}\left((B * B)^{T}(A * A)\right) .
\]

Proof. Define \(k=i+(j-1) n\) for \(i=1, \ldots, n\) and \(j=1, \ldots, r\). Then we have
\[
\begin{aligned}
\left(C^{T} C\right)_{k k} & =\sum_{\ell=1}^{q} C_{\ell k}^{2}=\sum_{\ell=1}^{q} B_{\ell i}^{2} A_{\ell j}^{2} \\
& =\left[(B * B)^{T}(A * A)\right]_{i j}=\left[\operatorname{vec}\left((B * B)^{T}(A * A)\right)\right]_{k}
\end{aligned}
\]

We apply these results in the next section.

\section*{B.10.4 PCG Solution of Transformed UI Subproblem}

We can form \(\bar{F}\) similarly to how we formed \(F\). We define \(H=U D \in \mathbb{R}^{n \times n}\) and \(\hat{H} \in \mathbb{R}^{q \times n}\) such that \(\hat{H}(\ell,:)=H\left(i_{k}^{(\ell)},:\right)\) for each \(\ell \in[q]\). Then, for each \(\ell \in[q]\), we let
\[
\bar{F}(\ell,:)=\hat{Z}(\ell,:) \otimes \hat{H}(\ell,:) .
\]

Let \(x \in \mathbb{R}^{r n}\) be an arbitrary vector, and let \(X \in \mathbb{R}^{n \times r}\) be its matrix representation so that \(\operatorname{vec}(X)=x\). From Lemmas 1 and 2 in Section B.10.3, we can compute \(\bar{F}^{T} \bar{F} x\) as
\[
\operatorname{vec}\left(\hat{H}^{T} \operatorname{diag}\left((\hat{Z} * \hat{H} X) 1_{r}\right) \hat{Z}\right)
\]

Then, we can compute the matrix-vector products for the conjugate gradient iterations without forming any Kronecker products using
\[
\left(\bar{F}^{T} \bar{F}+\lambda\left(I_{r} \otimes D\right)+\rho I_{r n}\right) x=\operatorname{vec}\left(\hat{H}^{T} \operatorname{diag}\left((\hat{Z} * \hat{H} X) 1_{r}\right) \hat{Z}+\lambda D X+\rho X\right)
\]

We propose a diagonal preconditioner of the form
\[
\bar{D}=\operatorname{diag}\left(\operatorname{diag}\left(\bar{F}^{T} \bar{F}\right)\right)+\lambda\left(I_{r} \otimes D\right)+\rho I_{r n}
\]

Observe that \(\bar{d}:=\operatorname{diag}(\bar{D})\) is easy to compute since
\[
\begin{aligned}
\bar{d} & \left.=\operatorname{diag}\left(\operatorname{diag}\left(\bar{F}^{T} \bar{F}\right)\right)+\lambda\left(I_{r} \otimes D\right)+\rho I_{r n}\right) \\
& =\operatorname{diag}\left(\bar{F}^{T} \bar{F}\right)+\lambda\left(1_{r} \otimes \operatorname{diag}(D)\right)+\rho 1_{r n} \\
& =\operatorname{vec}\left((\hat{H} * \hat{H})^{T}(\hat{Z} * \hat{Z})\right)+\lambda\left(1_{r} \otimes \operatorname{diag}(D)\right)+\rho 1_{r n}
\end{aligned}
\]

The last step comes from Lemma 3 in Section B.10.3.

\section*{B.10.5 Comparison of Costs}

A comparison of the direct solution of the original symmetric problem Equation (B.2) and PCG iterative solutions of the transformed problem Equation (B.7) are shown in Table 1. For PCG, we let \(p\) denote the number of iterations needed for convergence. Recall that \(d\) is the order of the tensor, \(n\) is the size of mode \(k, r\) is the target rank, and \(q\) is the number of known entries. In general, we do not make assumptions about the relative sizes of \(n\) and \(r\). We do assume, however, that \(d<n, r \ll q\). Because we are working with an incomplete tensor, the MTTKRP is relatively cheap and never dominates the cost.

\begin{table}
\captionsetup{labelformat=empty}
\caption{Table 1: Comparison of costs to solve the mode- \(k\) unaligned infinite-dimensional subproblem Equation (B.1) of size \(n r \times n r\) where \(n\) is the size of mode \(k\) and \(r\) is the target tensor decomposition rank. The variable \(q\) is the number of known entries in the observed tensor \(\mathcal{T}\). For the PCG iterative method, \(p\) is the number of iterations.}
\begin{tabular}{|l|l|l|}
\hline Description & Direct Symmetric & PCG Iterative \\
\hline Factorize \(K=U D U^{T}\) one-time cost! & - & \(\mathcal{O}\left(n^{3}\right)\) \\
\hline Compute \(\hat{Z}\) and MTTKRP \(B:=\mathcal{T} Z\) & \(\mathcal{O}(q r d)\) & \(\mathcal{O}(q r d)\) \\
\hline Form \(F\) (and \(G\) ) or \(H\) & \(\mathcal{O}(q r n)\) & \(\mathcal{O}\left(n^{2}\right)\) \\
\hline Form matrix for linear solve & \(\mathcal{O}\left(q r^{2} n^{2}\right)\) & - \\
\hline Form right-hand side & \(\mathcal{O}\left(n^{2} r\right)\) & \(\mathcal{O}\left(n^{2} r\right)\) \\
\hline Form preconditioner ( \(\bar{d}\) ) & - & \(\mathcal{O}\left(q n^{2}+q r^{2}\right)\) \\
\hline Solve system & \(\mathcal{O}\left(r^{3} n^{3}\right)\) & \(\mathcal{O}(p n q r)\) \\
\hline Recover \(W\) & - & \(\mathcal{O}\left(n^{2} r\right)\) \\
\hline Total cost & \(\mathcal{O}\left(q n^{2} r^{2}+n^{3} r^{3}\right)\) & \(\mathcal{O}\left(q n^{2}+q r^{2}+q n r p\right)\) \\
\hline Storage & \(\mathcal{O}\left(q n r+r^{2} n^{2}\right)\) & \(\mathcal{O}(q n+q r)\) \\
\hline
\end{tabular}
\end{table}

Factorizing the kernel matrix \(K\) for the transformed system The eigendecomposition of \(K\) costs \(\mathcal{O}\left(n^{3}\right)\) flops. We stress once again that this is only done one time before the outermost alternating optimization iterations begin. In the methods we compare here, this is needed only for the PCG iterative method.

Shared costs of all methods The \(q \times r\) matrix \(\hat{Z}\) defined in Equation (B.3) is used by both methods. Likewise, the \(n \times r\) MTTKRP \(B=\mathcal{T} Z\) is used by all methods. The cost to compute \(\hat{Z}\) is \(\mathcal{O}(q r d)\). Computing \(B\) is an MTTKRP with an incomplete tensor (Ballard and Kolda, Tensor Decompositions for Data Science, Cambridge University Press, 2025, with PDF available freely online). This would normally cost \(\mathcal{O}(q r d)\) operations, but we can use \(\hat{Z}\) to reduce the cost to \(\mathcal{O}(q r)\) operations.

Direct solve of symmetric regularized system We first analyze the cost to form and solve the system as discussed in Section B.10.1. We have to explicitly form \(F\) to form the system in Equation (B.2). The cost to compute the \(q \times r n\) matrix \(F\) is \(\mathcal{O}(q r n)\) and requires \(\mathcal{O}(q r n)\) storage. Forming the \(r n \times r n\) matrix \(F^{T} F+\lambda\left(I_{r} \otimes K\right)+\rho I_{r n}\) is dominated by the cost to compute \(F^{T} F\), which costs \(\mathcal{O}\left(q r^{2} n^{2}\right)\) operations. We also have to compute the right-hand side vec \((K B)\), which costs \(\mathcal{O}\left(n^{2} r\right)\) operations. Finally, using a direct method such as Cholesky to solve the system costs \(\mathcal{O}\left((r n)^{3}\right)\) operations. The storage is either dominated by storing \(F\) or the system matrix, which is \(\mathcal{O}\left(r n q+r^{2} n^{2}\right)\).

PCG iterative solve of transformed system We now analyze the cost of using PCG to solve the transformed system Equation (B.7) as discussed in Section B.10.4. The right-hand side \(\operatorname{vec}(\bar{B})=\operatorname{vec}\left(D U^{T} B\right)\) can be computed at a cost of \(\mathcal{O}\left(n^{2} r\right)\) operations. We first have to compute the \(n \times n\) matrix \(H:=U D\), which costs \(\mathcal{O}\left(n^{2}\right)\) operations. Forming the diagonal preconditioner, the \(r n\)-vector \(\bar{d}\) in Equation (B.11), costs \(\mathcal{O}\left(q n^{2}+q r^{2}\right)\) operations. We never form \(\bar{F}\) explicitly, which saves both computation and storage. Each matrix-vector product is computed as in Equation (B.10) at a cost of \(\mathcal{O}(q n r)\) operations. Each preconditioner application costs \(\mathcal{O}(r n)\) operations. Assuming that PCG converges in \(p\) iterations, the total cost for the PCG iterations is \(\mathcal{O}(p q n r)\) operations. Finally, after solving for \(\bar{W}\), we have to recover \(W=U \bar{W}\), which costs \(\mathcal{O}\left(n^{2} r\right)\) operations. The storage needed for PCG is dominated by storing \(\hat{Z}\) and \(\hat{H}\), which is \(\mathcal{O}(q n+q r)\).

Summary and Comparison The direct method is cubic in the size of the unknown matrix \(W\). In contrast, the PCG iterative method has a cost that is orders of magnitude lower, depending on the number of iterations \(p\) needed for convergence and the relative sizes of \(n, r\) and \(p\). In general, we expect the problem to be well conditioned so that \(p\) is not too large. The PCG method also has significantly lower storage requirements. Assuming \(r<n<r n<q\), we have \(q r n\) storage for the direct methods versus \(q n\) storage for PCG.