\documentclass[11pt,letterpaper]{amsart}

\makeatletter
\def\input@path{{./}{./draft/proof/}}
\makeatother

\numberwithin{equation}{section}
\numberwithin{figure}{section}

\usepackage{amssymb}
\usepackage{mathtools}
\usepackage[headings]{fullpage}
\usepackage{amsmath}
\usepackage{thmtools}
\usepackage{thm-restate}
\usepackage{graphicx}
\usepackage{xparse}
\usepackage[dvipsnames,table]{xcolor}
\usepackage[normalem]{ulem}
\usepackage[colorlinks=true,linkcolor=blue,citecolor=blue,urlcolor=blue,pagebackref=true]{hyperref}
\usepackage{enumitem}
\usepackage{tikz}
\usepackage{tikz-cd}
\usepackage{units}
\usepackage{ytableau}
\usepackage{verbatim}

% Show labels in the compiled PDF
\usepackage[inline]{showlabels}
\renewcommand{\showlabelfont}{\small\ttfamily\color{red}}

\usetikzlibrary{positioning}

\makeatletter
\def\theenumi{\@alph\c@enumi}
\makeatother

\theoremstyle{plain}
\newtheorem{theorem}[equation]{Theorem}
\newtheorem{lemma}[equation]{Lemma}
\newtheorem{corollary}[equation]{Corollary}
\newtheorem{proposition}[equation]{Proposition}

\theoremstyle{definition}
\newtheorem{question}[equation]{Question}
\newtheorem{problem}[equation]{Problem}
\newtheorem{conjecture}[equation]{Conjecture}
\newtheorem{remark}[equation]{Remark}
\newenvironment{remarkbox}[1][]{%
    \begin{remark}[#1]\pushQED{\qed}}{\popQED\end{remark}}

\newtheorem{example}[equation]{Example}
\newenvironment{examplebox}[1][]{%
    \begin{example}[#1]\pushQED{\qed}}{\popQED\end{example}}

\newtheorem{definition}[equation]{Definition}
\newenvironment{definitionbox}[1][]{%
    \begin{definition}[#1]\pushQED{\qed}}{\popQED\end{definition}}

\newtheorem{notation}[equation]{Notation}
\newenvironment{notationbox}[1][]{%
    \begin{notation}[#1]\pushQED{\qed}}{\popQED\end{notation}}

\newtheorem{discussion}[equation]{Discussion}
\newenvironment{discussionbox}[1][]{%
    \begin{discussion}[#1]\pushQED{\qed}}{\popQED\end{discussion}}

\newtheorem{observation}[equation]{Observation}
\newenvironment{observationbox}[1][]{%
    \begin{observation}[#1]\pushQED{\qed}}{\popQED\end{observation}}

\newtheorem{construction}[equation]{Construction}
\newenvironment{constructionbox}[1][]{%
    \begin{construction}[#1]\pushQED{\qed}}{\popQED\end{construction}}

\newtheorem{setup}[equation]{Setup}
\newtheorem{theorem*}{Theorem}

\newcommand{\Ext}{\operatorname{Ext}}
\newcommand{\del}{\operatorname{del}}
\newcommand{\pos}{\operatorname{pos}}
\DeclareMathOperator{\Ins}{Ins}
\DeclareMathOperator{\Cat}{Cat\textbf{}}
\newcommand{\Rec}{\mathrm{Rec}}
\newcommand{\std}{\mathrm{std}}
\newcommand{\Sig}{\mathrm{Sig}}
\newcommand{\pref}{\mathrm{pref}}
\newcommand{\suf}{\mathrm{suf}}
\newcommand{\Av}{\operatorname{Av}}
\newcommand{\CoGr}{\operatorname{CoGr}}
\newcommand{\Vex}{\operatorname{Vex}}
\newcommand{\CoVex}{\operatorname{CoVex}}
\newcommand{\Sm}{\operatorname{Sm}}
\newcommand{\Lev}{\operatorname{Lev}}
\newcommand{\Cont}{\operatorname{Cont}}
\newcommand\spann[1]{\left\langle #1\right\rangle}
\newcommand{\Grass}{\mathcal{G}}
\newcommand{\Std}{\mathrm{Std}}
\newcommand{\WStd}{\mathrm{WStd}}
\newcommand{\pl}{\mathrm{p}}
\newcommand{\Bl}{\mathrm{Block}}
\newcommand{\Cl}{\mathrm{Class}}
\newcommand{\He}{\mathrm{Head}}
\newcommand{\GL}{\mathrm{GL}}
\newcommand{\SL}{\mathrm{SL}}
\newcommand{\SP}{\mathrm{Sp}}
\newcommand{\Id}{\mathrm{Id}}
\newcommand{\id}{\mathrm{id}}
\newcommand{\Mat}{\mathrm{Mat}}
\newcommand{\Sym}{\mathrm{Sym}}
\newcommand{\iidsim}{\stackrel{\mathrm{iid}}{\sim}}
\newcommand{\sign}[1]{\mathrm{sgn(#1)}}
\newcommand{\content}[1]{\mu(#1)}
\newcommand{\stab}[2]{\textrm{\textbf{stab}}_{#1}(#2)}
\newcommand{\rcf}[2]{\mathcal{R}_{\scriptscriptstyle #1,#2}}
\newcommand{\stdcontent}[2]{S(#1,#2)}
\newcommand{\tabcontent}[2]{T(#1,#2)}
\newcommand{\fillcontent}[2]{F(#1,#2)}
\newcommand{\fillcontentc}[2]{F^c(#1,#2)}
\newcommand{\rbasis}[1]{D_{#1}}
\newcommand{\reval}[1]{\mathfrak{R}_{-,#1}}
\newcommand{\kostka}[2]{K_{\scriptscriptstyle #1,#2}}
\newcommand{\labeling}[2]{\mathcal{L}_{\scriptscriptstyle #1,#2}}
\newcommand{\perm}[2]{#1(#2)}
\newcommand{\ycs}[2]{C_{\scriptscriptstyle #2}(#1)}
\newcommand{\sorting}[1]{\operatorname{sort}(#1)}
\newcommand{\rowsorting}[1]{\operatorname{rowsort}(#1)}
\newcommand{\rowcon}[3]{\mathrm{RC}((#1)_{#3},#2)}
\newcommand{\fjminus}{j-}
\newcommand{\fjplus}{j+}
\newcommand{\Grr}[1]{\mathrm{Gr}(#1)}
\newcommand{\Plr}[1]{\mathrm{Pl}(#1)}
\newcommand{\Plrs}[1]{\mathrm{SPl}(#1)}
\newcommand{\bare}[1]{\overline{e}_{#1}}
\DeclareMathOperator{\FS}{\mathrm{FS}}

\DeclarePairedDelimiterXPP\Prob[1]{\mathbb{P}}(){}{#1}
\DeclarePairedDelimiterXPP\E[1]{\mathbb{E}}{[}{]}{}{#1}
\DeclarePairedDelimiterXPP\Var[1]{\mathbb{V}\mathrm{ar}}(){}{#1}
\DeclarePairedDelimiterXPP\Cov[1]{\mathbb{C}\mathrm{ov}}(){}{#1}
\DeclarePairedDelimiterXPP\Corr[1]{\mathbb{C}\mathrm{orr}}(){}{#1}
\newcommand{\Unif}[1]{\mathrm{Unif}(#1)}

\DeclareMathOperator{\rec}{\mathcal{R}}
\DeclareMathOperator{\BS}{BS}
\newcommand{\rlmax}{\mathrm{rlmax}}
\newcommand{\RLM}{\mathrm{RLM}}
\newcommand{\St}{\mathrm{St}}
\newcommand{\Int}{\mathrm{Int}}

\begin{document}

\title{The record equivalence}
\author{Reuven Hodges, Hanzhang Yin}

\maketitle

\section{Preliminaries}
For $n\ge 1$ let $S_n$ denote the symmetric group on $\{1,\dots,n\}$, written in one-line notation
$w=w(1)\,w(2)\cdots w(n)$.

\begin{definition}[Right-inversion count]\label{def:right-inversion}
For $w\in S_n$ and $j\in[n]$, the \emph{right-inversion count} of position~$j$ is
\[
d_j(w)\;:=\;\bigl|\{k\,:\,k>j\ \text{and}\ w(k)>w(j)\}\bigr|.
\]
\end{definition}

\begin{definition}[Right-to-left maximum]\label{def:rlm}
A position $j\in[n]$ is a \emph{right-to-left maximum} of $w\in S_n$ if
$d_j(w)=0$, i.e., there is no larger element to the right of position~$j$.
The \emph{right-to-left maximum indicator} and its complement are
\[
\rlmax_j(w)\;:=\;\mathbf{1}\{d_j(w)=0\},
\qquad
\chi_j(w)\;:=\;1-\rlmax_j(w).
\]
The set of right-to-left maximum positions is
\[
\RLM(w)=\{j\in[n]:\rlmax_j(w)=1\}.
\]
Note that $\RLM(w)$ always contains the position of $n$ in~$w$.
\end{definition}

\begin{definition}[Pattern avoidance]
Let $\pi\in S_k$ and let $w\in S_n$. We say that $w$ \emph{contains} the pattern $\pi$ if there exist indices
\[
1\le i_1<i_2<\cdots<i_k\le n
\]
such that the subsequence $(w(i_1),\dots,w(i_k))$ has the same relative order as
$(\pi(1),\dots,\pi(k))$. If no such indices exist, then $w$ \emph{avoids} $\pi$.
For patterns $\pi^{(1)},\dots,\pi^{(r)}$ we write
\[
\Av_n(\pi^{(1)},\dots,\pi^{(r)})
:=
\{w\in S_n: w \text{ avoids each } \pi^{(t)}\}.
\]
\end{definition}

\begin{definition}[Right-to-left-maximum-equivalence]
  Let $\pi,\sigma\in S_k$. We say that $\pi$ and $\sigma$ are \emph{right-to-left-maximum-equivalent} if for every $n\ge k$ and every subset $R\subseteq[n]$,
  \[
  \bigl|\{w\in \Av_n(\pi): \RLM(w)=R\}\bigr|
  =
  \bigl|\{w\in \Av_n(\sigma): \RLM(w)=R\}\bigr|.
  \]
  We write $\pi\sim_{rlmax}\sigma$.
  \end{definition}

\begin{definition}[Permutation matrix]\label{def:permutation-matrix}
Let $p = p(1)\,p(2)\,\ldots\,p(m) \in S_m$.
The associated $m \times m$ permutation matrix $M_p$ has $(i,j)$-entry $1$ if $j = p(i)$ and $0$ otherwise.
Let $S_n(M)$ be the set of $n \times n$ permutation matrices which do not contain the $m \times m$ permutation matrix $M$ as a submatrix.
More generally, if $L$ is a rook placement on a Young diagram~$\lambda$,
we say that $L$ \emph{contains} $M$ if there exist rows
$r_1 < \cdots < r_m$ and columns $c_1 < \cdots < c_m$ such that
$(r_i, c_j) \in \lambda$ for all $i,j$ and the $m \times m$ submatrix
of~$L$ on these rows and columns equals~$M$.
Let $S_\lambda(M)$ denote the set of rook placements of~$\lambda$
that avoid~$M$.
\end{definition}

\begin{definition}[Rook placement]\label{def:rook-placement}
  Let $\lambda$ be a Young diagram.  A \emph{rook placement} of $\lambda$ is a
  placement of rooks (dots) on the cells of $\lambda$ such that each row
  and each column of $\lambda$ contains exactly one rook.
  \end{definition}

\begin{definition}[Permutation board]\label{def:permutation-board}
Let $w\in S_n$. The \emph{rook diagram} of $w$ on the $n\times n$ board is a diagram corresponding to the permutation matrix $M_w$ where $0$ entries are replaced by empty cells and $1$ entries are replaced by rooks. We use $R_{n\times n}(w)$ to denote the rook diagram of $w$, and $(i, j)$ to denote the cell in the $i$-th row and $j$-th column of the rook diagram.
\end{definition}

\begin{example}[Permutation matrix and permutation board]\label{ex:permutation-board}
The permutation $w = 2\,3\,1 \in S_3$ corresponds to the permutation matrix (left), and to a rook placement on the $3\times 3$ board (right).
\[
\renewcommand{\arraystretch}{1.4}
\begin{array}{|c|c|c|}
\hline
0 & 1 & 0 \\
\hline
0 & 0 & 1 \\
\hline
1 & 0 & 0 \\
\hline
\end{array}
\qquad\qquad
\begin{array}{|c|c|c|}
\hline
  & \bullet &   \\
\hline
  &   & \bullet \\
\hline
\bullet &   &   \\
\hline
\end{array}
\]
The rooks are in the cells $(1, 2)$, $(2, 3)$, $(3, 1)$.
\end{example}

\begin{definition}[Southeast region]\label{def:se-region}
  Given a rook diagram $w$, the \emph{southeast region} of a cell $(i, j)$ denoted by $\mathrm{SE}(i, j)$ is the set of cells strictly
  below and to the right. In other words,
  \[
  \mathrm{SE}(i,j) \;:=\; \bigl\{(r, c) : r > i \text{ and } c > j\bigr\}.
  \]
  \end{definition}

  \begin{example}[Southeast region]\label{ex:se-region}
    Let $w = 3\,5\,1\,6\,2\,4 \in S_6$, with rooks at positions $(1,3)$, $(2,5)$, $(3,1)$, $(4,6)$, $(5,2)$, $(6,4)$. The southeast region of cell $(1, 5)$ (SE$(1, 5)$) is shaded red below
    \[
    \renewcommand{\arraystretch}{1.4}
    \begin{array}{|c|c|c|c|c|c|}
    \hline
      &   & \bullet &   &   &   \\
    \hline
      &   &   &   & \bullet & \cellcolor{red!25} \\
    \hline
    \bullet &   &   &   &   & \cellcolor{red!25} \\
    \hline
      &   &   &   &   & \cellcolor{red!25}\bullet \\
    \hline
      & \bullet &   &   &   & \cellcolor{red!25} \\
    \hline
      &   &   & \bullet &   & \cellcolor{red!25} \\
    \hline
    \end{array}
    \]
    \end{example}

\begin{lemma}\label{lem:rlm-se-region}
  Given a permutation $w\in S_n$ and its corresponding rook diagram, a position $j$ is a right-to-left maximum in $w$ if and only if
  $\mathrm{SE}(j, w(j))$ contains no rook.
\end{lemma}

\begin{proof}
Suppose $j$ is an RLM.  Then for every $k > j$, we have
$w(k) < w(j)$.  Since $k > j$ and $w(k) < w(j)$, the rook at
$(k, w(k))$ satisfies $k > j$ but $w(k) \not> w(j)$, so it does not lie
in $\mathrm{SE}(j, w(j))$.  As this holds for all $k > j$, no rook
lies in $\mathrm{SE}(j, w(j))$.

For the other direction, suppose $j$ is not an RLM.  Then there exists $k > j$
with $w(k) > w(j)$.  The rook at $(k, w(k))$ satisfies both $k > j$
and $w(k) > w(j)$, so it lies in $\mathrm{SE}(j, w(j))$.
\end{proof}


\begin{definition}[Rook placement on a Young diagram]\label{def:rook-placement-on-young-diagram}
  Let $\lambda$ be a Young diagram (a left-justified array of rows with weakly decreasing row lengths).  A \emph{rook placement} on $\lambda$ is a placement of rooks on the cells of $\lambda$ such that no two rooks lie in the same row or the same column.  Equivalently, a rook placement corresponds to a permutation matrix supported on the shape $\lambda$, or to a filling of $\lambda$ with exactly one rook in each row and each column.
\end{definition}

\begin{example}[Rook placement on a Young diagram]\label{ex:rook-placement-on-young-diagram}
  Let $\lambda$ be the Young diagram of shape $(3,2,1)$.  Place rooks in the cells $(1,3)$, $(2,2)$, and $(3,1)$:
  \[
  \ytableausetup{boxsize=1.2em}
  \begin{ytableau}
  {} & {} & \bullet \\
  {} & \bullet \\
  \bullet
  \end{ytableau}
  \]
  This is a full rook placement on $\lambda$: each row and each column of $\lambda$ contains exactly one rook.  Reading the rook-columns from top to bottom gives the permutation $3\,2\,1$.  Thus this example is a rook placement on the Young diagram $\lambda$, not on the full $3\times 3$ board.
  \end{example}

\begin{definition}[Shape-Wilf-equivalence]\label{def:shape-wilf}
Let $\pi,\sigma\in S_k$.  We say that $\pi$ and $\sigma$ are
\emph{shape-Wilf-equivalent} if $|S_\lambda(\pi)| = |S_\lambda(\sigma)|$
for every Young diagram $\lambda$, where $S_\lambda(\pi)$ denotes the set
of rook placements of $\lambda$ that avoid the permutation matrix $M_\pi$.
We write $\pi\sim_{sW}\sigma$.
\end{definition}

\begin{definition}[Direct sum]\label{def:direct-sum}
Let $\alpha\in S_k$ and $\beta\in S_\ell$. The \emph{direct sum} $\alpha\oplus\beta$ is the permutation of $[k+\ell]$ defined by
\[
(\alpha\oplus\beta)(i)
=
\begin{cases}
\alpha(i), & \text{if } 1\le i\le k,\\[4pt]
\beta(i-k)+k, & \text{if } k<i\le k+\ell.
\end{cases}
\]
\end{definition}

The bijection at the heart of the present paper originates in the work of
Backelin, West, and Xin~\cite{BWX2007}, who proved (Proposition~2.3
of~\cite{BWX2007}) that if $\pi\sim_{sW} \sigma$, then
$\pi\oplus\alpha\sim_{sW} \sigma\oplus\alpha$ for any nonempty permutation~$\alpha$.
Their proof constructs an explicit bijection between avoidance classes via the
following three-step decomposition.

\begin{definitionbox}[$\Phi_{\pi, \sigma}^{\alpha}$ bijection]\label{def:bwx-coloring}
  Suppose that $\pi\sim_{sW} \sigma$ and fix a nonempty permutation $\alpha$ and a permutation $w\in \Av_n(\pi\oplus\alpha)$. Following the construction of~\cite{BWX2007}, we build a bijection from $w$ to a permutation $w'$ in $\Av_n(\sigma\oplus\alpha)$.

  \emph{Step~1 (coloring).}\enspace
  Colour each cell $(i,j)$ of $R_{n\times n}(w)$ white if $\mathrm{SE}(i,j)$ contains an occurrence of $\alpha$,
  and blue otherwise.

  \emph{Step~2 (blue rows and columns).}\enspace
  Colour a row blue if it contains a blue rook; colour a column blue if it contains a blue rook.

  Let $F'$ be the young diagram obtained by deleting all blue rows and all blue
  columns from $R_{n\times n}(w)$, and let $P'$ be the rook diagram on $F'$ induced by~$R_{n\times n}(w)$.

  \emph{Step~3 (white-board transformation).}\enspace
  Let $\phi_{\pi, \sigma}$ be the shape-Wilf bijection
  $S_{F'}(\pi)\to S_{F'}(\sigma)$ whose existence is guaranteed by the
  shape-Wilf-equivalence $\pi\sim_{sW} \sigma$ (see~\cite{BWX2007}).  The \emph{white-board transformation} is the map
  \[
  \phi_{\pi, \sigma}: P'\;\longmapsto\;P''.
  \]
  which produces a new rook diagram $P''$ on $F'$.

  The $\Phi_{\sigma, \pi}^{\alpha}$ bijection is obtained by reinserting the blue rows and columns
  (fixed unchanged) around $P''$.
  \end{definitionbox}

\begin{example}[Illustration of $\Phi_{\pi, \sigma}^{\alpha}$ construction]\label{ex:bwx-coloring}
  We illustrate the three-step construction for $\pi=12$, $\sigma=21$, $\alpha=[1]$, so that
  $M=12\oplus 1=123$ and $M'=21\oplus 1=213$.  Let $\lambda$ be the $4\times 4$ board
  and let $N$ be the rook placement for $w=2143\in\Av_4(123)$, with rooks at
  $(1,2)$, $(2,1)$, $(3,4)$, $(4,3)$.

  \medskip\noindent\textbf{Step 1 (Coloring).}
  Since $\alpha=[1]$, a cell is coloured \emph{white} if its southeast region contains
  a rook, and \emph{blue} otherwise.  The resulting colouring:
  \[
  \renewcommand{\arraystretch}{1.4}
  \begin{array}{|c|c|c|c|}
  \hline
    & \bullet &   & \cellcolor{blue!25} \\
  \hline
  \bullet &   &   & \cellcolor{blue!25} \\
  \hline
    &   & \cellcolor{blue!25} & \cellcolor{blue!25}\bullet \\
  \hline
  \cellcolor{blue!25} & \cellcolor{blue!25} & \cellcolor{blue!25}\bullet & \cellcolor{blue!25} \\
  \hline
  \end{array}
  \]
  The blue cells form a staircase in the bottom-right corner: column~$4$ is entirely
  blue, as are rows $3$--$4$ from column~$3$ onward.

  \medskip\noindent\textbf{Step 2 (Coloring blue rows and columns).}
  The rooks on blue squares are $(3,4)$ and $(4,3)$.  Colouring their rows and
  columns blue removes rows $\{3,4\}$ and columns $\{3,4\}$.  The white board $\pi$
  is the $2\times 2$ subboard on rows and columns $\{1,2\}$.
  \[
  \renewcommand{\arraystretch}{1.4}
  \begin{array}{|c|c|c|c|}
  \hline
    & \bullet & \cellcolor{blue!25} & \cellcolor{blue!25} \\
  \hline
  \bullet &   & \cellcolor{blue!25} & \cellcolor{blue!25} \\
  \hline
  \cellcolor{blue!25} & \cellcolor{blue!25} & \cellcolor{blue!25} & \cellcolor{blue!25}\bullet \\
  \hline
  \cellcolor{blue!25} & \cellcolor{blue!25} & \cellcolor{blue!25}\bullet & \cellcolor{blue!25} \\
  \hline
  \end{array}
  \]

  \medskip\noindent\textbf{Step 3 (apply the shape-Wilf bijection).}
  Since $\pi=12$ and $\sigma=21$, the bijection
  $\phi_{\pi, \sigma}: S_{(2, 2)}(12)\to S_{(2, 2)}(21)$ maps $21\mapsto 12$.  The new rook placement
  on $\pi$ has rooks at $(1,1)$ and $(2,2)$.

  Recombining with the blue rooks, the output $\Phi_{12,21}^{1}(N)$ has rooks at
  $(1,1)$, $(2,2)$, $(3,4)$, $(4,3)$, corresponding to
  $w'=1243\in\Av_4(213)$.
  \[
  \renewcommand{\arraystretch}{1.4}
  \begin{array}{|c|c|c|c|}
  \hline
  \bullet &   &   &   \\
  \hline
    & \bullet &   &   \\
  \hline
    &   &   & \bullet \\
  \hline
    &   & \bullet &   \\
  \hline
  \end{array}
  \]
  \end{example}

\section{Right-to-left maxima and shape-Wilf bijections}
The argument below shows that the bijection in Definition~\ref{def:bwx-coloring} preserves $\RLM$.

\begin{definition}[Staircase]\label{def:staircase}
  Let $w\in S_n$ with right-to-left maximum positions
  $j_1 < j_2 < \cdots < j_m = n$, where $j_1 = p_n$ (the position of value
  $n$).  The \emph{staircase} of $R_{n\times n}(w)$, denoted $\St(w)$, is the set of cells $(i,j)$ on or
  below the monotone lattice path (or Dyck path) from $(n,1)$ to $(1,n)$ that traces:
  \begin{enumerate}[label=(\roman*)]
  \item a horizontal segment from $(n, 1)$ to $(n, w(j_m))$ in the last row;
  \item for $k = m, m-1, \ldots, 2$: a vertical segment from $(j_k,
  w(j_k))$ to $(j_{k-1}, w(j_k))$, then a horizontal segment from
  $(j_{k-1}, w(j_k))$ to $(j_{k-1}, w(j_{k-1}))$;
  \item a vertical segment from $(j_1, w(j_1)) = (p_n, n)$ to
  $(1, n)$ in the last column.
  \end{enumerate}
  A cell $(i,j)$ is in $\St(w)$ if it lies on this path, or if it is
  strictly southeast of some cell on the path.  The path visits all
  right-to-left maximum cells:
  $(j_m, w(j_m))$, $(j_{m-1}, w(j_{m-1}))$, $\ldots$, $(j_1, w(j_1))$.
  We denote the \emph{boundary} of the staircase (the Dyck path) by
  $\partial\St(w)$ and the \emph{interior} of the staircase
  (cells of $\St(w)$ not on the path) by $\Int(\St(w))$.
  \end{definition}

  \begin{example}\label{ex:staircase}
  Let $w = 2\,4\,1\,3 \in S_4$.  The rooks are at
  $(1,2)$, $(2,4)$, $(3,1)$, $(4,3)$.  The right-to-left maximum positions
  are $j_1 = 2$ (with $w(2) = 4$) and $j_2 = 4$ (with $w(4) = 3$).
  The staircase (shaded cells) is traced by the bold path:
  \[
  \renewcommand{\arraystretch}{1.4}
  \begin{array}{|c|c|c|c|}
  \hline
    & \bullet &  & \cellcolor{blue!25} \\
  \hline
    &  & \cellcolor{blue!25} & \cellcolor{blue!25}\bullet \\
  \hline
  \bullet &  & \cellcolor{blue!25} & \cellcolor{blue!25} \\
  \hline
  \cellcolor{blue!25} & \cellcolor{blue!25} & \cellcolor{blue!25}\bullet & \cellcolor{blue!25} \\
  \hline
  \end{array}
  \]
  Reading the staircase from $(4,1)$ to $(1,4)$: a horizontal segment from
  $(4,1)$ to $(4,3)$ in the last row; then a vertical segment from $(4,3)$
  to $(2,3)$ (visiting the RLM cell $(4,3)$); then a horizontal segment from
  $(2,3)$ to $(2,4)$ (visiting the RLM cell $(2,4)$); finally a vertical
  segment from $(2,4)$ to $(1,4)$ in the last column.
  \end{example}

\begin{lemma}\label{lem:blue-rlm-12-21}
  Let $\sigma\sim_{sW} \pi$ and $\alpha$ be a nonempty permutation.  For every $w\in\Av_n(\sigma\oplus\alpha)$, in the $\Phi_{\pi, \sigma}^{\alpha}$ construction for
  $\sigma\oplus\alpha$ versus $\pi\oplus\alpha$, every right-to-left maximum position of $w$ is colored blue.
  \end{lemma}

\begin{proof}
Let $(j,w(j))$ be the rook corresponding to a right-to-left maximum
position $j$. By Definition~\ref{def:rlm}, there is no index $k>j$ with $w(k)>w(j)$.
In matrix coordinates, this means that
$SE(j,w(j))$ contains no rooks. Since $\alpha$ is nonempty, any
occurrence of $\alpha$ in that southeast region would require at least
one rook there. Therefore, that southeast region contains no
occurrence of $\alpha$, so $(j,w(j))$ is colored blue by the $\Phi_{\pi, \sigma}^{\alpha}$
coloring rule.
\end{proof}

\begin{lemma}[Empty rectangle lemma]\label{lem:empty-rectangle}
Let $w \in S_n$.  Let $r_2 < r_1$ be two consecutive right-to-left maximum
positions of $w$ with $w(r_2) > w(r_1)$, and set $j_2 = w(r_2)$,
$j_1 = w(r_1)$.  Then for every cell $(r, j)$ in the interior of the
rectangle $[r_2, r_1]\times[j_1, j_2]$, i.e., with $r_2 < r < r_1$ and
$j_1 < j < j_2$:
\begin{enumerate}[label=\textup{(\roman*)}]
\item there is no rook at $(r, j)$, and
\item the southeast region of $(r, j)$ contains no rook, and
\item for any nonempty permutation $\alpha$, the southeast region of $SE(r, j)$ contains no occurrence of $\alpha$ and every such cell is colored blue by $\Phi_{\pi,\sigma}^{\alpha}$.
\end{enumerate}
\end{lemma}

\begin{proof}
\textbf{\textup{(i)}.} Suppose for contradiction that $w(r) = j$ for
some $r_2 < r < r_1$ and $j_1 < j < j_2$.  Since $r_2$ and $r_1$ are
consecutive right-to-left maxima, position $r$ is not a right-to-left
maximum, so there exists some position $k > r$ with $w(k) > w(r) = j$.
Let $k^*\in [n]$
\[
w(k^*) = \max\{w(k) : k > r\} > j.
\]
Since $w(k^*)$ is the largest value at any position to the right of~$r$,
every position $k > k^*$ satisfies $w(k) \leq w(k^*)$, so $k^*$ is a
right-to-left maximum.

Now $k^* > r > r_2$, and $k^*$ is a right-to-left maximum.  Since $r_1$
is the next right-to-left maximum after $r_2$, we must have $k^* \geq r_1$.
If $k^* > r_1$, then since $r_1$ is a right-to-left maximum, every
position $k > r_1$ satisfies $w(k) < w(r_1)$, which implies that
$w(k^*) < w(r_1)$.  But $r_1 > r$, so $w(r_1) \leq w(k^*)$ by definition
of~$k^*$.  Contradiction.  Therefore $k^* = r_1$, and $w(r_1) = w(k^*) > j$.

\textbf{\textup{(ii)}.} The $\mathrm{SE}(r, j)$ consists of
cells $(r', j')$ with $r' > r$ and $j' > j$.  Any rook in this
region would lie at some $(r', w(r'))$ with $r' > r$ and $w(r') > j$.
Since $r_2 < r < r_1$ and $j_1 < j < j_2$, such a rook would lie in
the interior of the rectangle $[r_2, r_1]\times[j_1, j_2]$.  By \textup{(i)}, no such rook exists.
Therefore the southeast of $(r, j)$ contains no rook.

\textbf{\textup{(iii)}.} Since $\alpha$ is nonempty, any
occurrence of $\alpha$ requires at least one rook. Thus, the empty
southeast region contains no occurrence of $\alpha$, and $(r, j)$ is
blue by the construction of $\Phi_{\pi,\sigma}^{\alpha}$.
\end{proof}

\begin{lemma}\label{lem:stair-case}
For any $w\in S_n$ and $R_{n\times n}(w)$ and $i, j\in [n]$, $\mathrm{SE}(i, j)$ contains no rook if and only if $(i, j)$ is
in $\St(w)$.
\end{lemma}

\begin{proof}
Suppose $(i, j)$ is in $\St(w)$.
If $(i, j)$ lies on the path, it sits on a vertical segment in column
$w(j_k)$ between rows $j_k$ and $j_{k-1}$, or on a horizontal segment in
row $j_{k-1}$ between columns $w(j_k)$ and $w(j_{k-1})$.  In the former
case, $\mathrm{SE}(i, j) \subseteq \mathrm{SE}(j_k, w(j_k))$, which contains no rook
(since $j_k$ is a right-to-left maximum).  In the latter case,
$\mathrm{SE}(i, j) \subseteq \mathrm{SE}(j_{k-1}, w(j_{k-1}))$, which contains no rook.
The endpoints $(n, w(n))$, $(p_n, n)$, $(n, 1)$, and $(1, n)$ all have
empty southeast (last row, last column, or both).  If $(i, j)$ is strictly
southeast of some cell $(r, c) \in \St(w)$, then
$\mathrm{SE}(i, j) \subseteq \mathrm{SE}(r, c)$, which contains no rook.

For the other direction, suppose $\mathrm{SE}(i, j)$ contains no rook.
Then for all $k > i$, we have $w(k) \leq j$. If $w(k)> j$, then the rook at
$(k, w(k))$ would lie in $\mathrm{SE}(i, j)$, which contradicts the assumption.

Let $s = \min\{j_k : j_k > i\}$ be the nearest right-to-left maximum
position strictly below row~$i$ (this exists since $n$ is always a
right-to-left maximum).  Since $s > i$, we have $w(s) \leq j$. If $j = w(s)$, then $(i, j) \in \St(w)$.
If $j > w(s)$, then $(i, j)\in \mathrm{SE}(s, w(s))$. Hence $(i, j) \in \St(w)$. Hence $(i, j) \in \St(w)$.
\end{proof}

\begin{lemma}[Staircase-is-blue]\label{lem:staircase-blue}
Let $w\in S_n$.  Every cell in $\St(w)$ is colored blue by the construction of $\Phi_{\pi,\sigma}^{\alpha}$.
\end{lemma}
\begin{proof}
  If $(i, j)\in \partial\St(w)$, then $(i, j)$ is colored blue by the construction of $\Phi_{\pi,\sigma}^{\alpha}$ and the definition of $\partial\St(w)$. If $(i, j)\in \Int(\St(w))$, then $(i, j)$ is in $\mathrm{SE}(i, j)$ where $i$ is a right-to-left maximum, which contains no rook by Lemma~\ref{lem:stair-case}. Therefore, $(i, j)$ is colored blue by the construction of $\Phi_{\pi,\sigma}^{\alpha}$.
  Given that $\St(w) = \partial\St(w) \cup \Int(\St(w))$, we have that every cell in $\St(w)$ is colored blue by the construction of $\Phi_{\pi,\sigma}^{\alpha}$.
\end{proof}


\begin{theorem}[RLM preservation for $\Phi_{\pi,\sigma}^{\alpha}$]\label{thm:rlm-bwx}
Let $\pi$ and $\sigma$ be shape-Wilf-equivalent permutations
($\pi\sim_{sW}\sigma$), and let $\alpha$ be a nonempty permutation.
The bijection
  $\Phi_{\pi,\sigma}^{\alpha}\colon\Av_n(\pi\oplus\alpha)\to\Av_n(\sigma\oplus\alpha)$
\[
\RLM(\Phi_{\pi,\sigma}^{\alpha}(w)) = \RLM(w)
\qquad\text{for all } w\in\Av_n(\pi\oplus\alpha).
\]
\end{theorem}

\begin{proof}
By Lemma~\ref{lem:blue-rlm-12-21}, every right-to-left maximum position has a
blue rook, and blue rooks are fixed under $\Phi_{\pi,\sigma}^{\alpha}$.  Therefore
all right-to-left maxima in $w$ are preserved in $\Phi_{\pi,\sigma}^{\alpha}(w)$.
It remains to show that no new right-to-left maximum is created. By Lemma~\ref{lem:staircase-blue}, every cell in $\St(w)$ is colored blue by the construction of $\Phi_{\pi,\sigma}^{\alpha}$. By Lemma~\ref{lem:stair-case}, $\mathrm{SE}(i, j)$ contains no rook if and only if $(i, j)$ is in $\St(w)$. By Lemma~\ref{lem:rlm-se-region}, no new right-to-left maximum is created.
\end{proof}



\section*{RLM distribution as a Wilf-class invariant}

The RLM-preserving property of the $\Phi_{\pi, \sigma}^{\alpha}$ bijection
(Theorem~\ref{thm:rlm-bwx}) shows that the right-to-left maximum
statistic refines shape-Wilf-equivalence.  We now show that it also
refines ordinary Wilf-equivalence within the family of direct sums
with~$12$.

\begin{definition}[RLM distribution]\label{def:rlm-dist}
For a permutation $\tau\in S_m$ and $n\ge m$, the \emph{RLM
distribution} of $\Av_n(\tau)$ is the map
\[
R_\tau(n,\cdot)\colon 2^{[n]}\to\mathbb{N},
\qquad
R_\tau(n,S) \;:=\;
\bigl|\{w\in\Av_n(\tau) : \RLM(w)=S\}\bigr|.
\]
Two patterns $\tau,\tau'$ are \emph{RLM-equivalent} if
$R_\tau(n,S)=R_{\tau'}(n,S)$ for all $n$ and all $S\subseteq[n]$.
We write $\tau\sim_{\rlmax}\tau'$.
\end{definition}

\begin{theorem}[RLM distribution determines direct-summands]\label{thm:rlm-refines-wilf}
Let $\alpha,\beta\in S_k$ with $k\ge 3$.  If\/
$12\oplus\alpha\sim_{\rlmax}12\oplus\beta$, then $\alpha=\beta$.
In particular, within the family
$\{12\oplus\alpha : \alpha\in S_k,\;k\ge 3\}$, the RLM distribution
is a strictly finer invariant than the Wilf class.
\end{theorem}

We use the enumeration scheme framework of
Zeilberger~\cite{Zeilberger1998}, Pudwell~\cite{Pudwell2008}, and
Baxter~\cite{Baxter2014}.  We recall the formal definitions
(see~\cite[Definitions~1--3]{Baxter2014}).

\begin{definition}[Prefix pattern]\label{def:prefix-pattern}
Let $\tau\in S_k$ and let $\pi\in S_n$ with $n\ge k$.  A
\emph{prefix pattern} of~$\pi$ (relative to~$\tau$) is a permutation
$p\in S_m$ ($m\le k$) obtained by standardizing an initial segment
of~$\pi$: there exist indices $1=i_1<i_2<\cdots<i_m\le n$ such that
$\pi(i_1),\ldots,\pi(i_m)$ has the same relative order as $p(1),\ldots,p(m)$.
For a prefix word $w=\pi(1)\cdots\pi(j)$, we write
$\Av_n(\tau)[p;w]$ for the set of permutations in $\Av_n(\tau)$ whose
first $j$ entries, standardized, give~$p$ and whose first $j$ values
are exactly~$w$.
\end{definition}

\begin{definition}[Gap function]\label{def:gap-function}
Let $w$ be a prefix word of length~$m$ (a sequence of $m$ distinct
values from $[n]$).  Write $w_{(1)}<w_{(2)}<\cdots<w_{(m)}$ for the
entries of~$w$ sorted by value (not by position).  The \emph{gap
function}
$\vec{g}(n,w)=(g_0,g_1,\ldots,g_m)\in\mathbb{N}^{m+1}$ counts the
available values in each interval determined by~$w$:
\begin{itemize}
\item $g_0=|\{v\in[n]: v < w_{(1)}\}|$ counts values strictly smaller
  than the smallest entry of~$w$;
\item $g_i=|\{v\in[n]: w_{(i)} < v < w_{(i+1)}\}|$ for
  $1\le i\le m-1$ counts values strictly between the $i$-th and
  $(i+1)$-th smallest entries (in value);
\item $g_m=|\{v\in[n]: v > w_{(m)}\}|$ counts values strictly larger
  than the largest entry of~$w$.
\end{itemize}
\end{definition}

\begin{example}\label{ex:gap-function}
If $w=5\,2\,7\,1$ with $n=8$, then
$w_{(1)}=1,\,w_{(2)}=2,\,w_{(3)}=5,\,w_{(4)}=7$ and
$\vec{g}(8,w)=(0,\,0,\,2,\,1,\,1)$: there are two available values
between $2$ and~$5$ (namely $3,4$) and one between $5$ and~$7$
(namely~$6$).
\end{example}

\begin{definition}[Gap vector]\label{def:gap-vector}
Let $\tau\in S_k$, let $p$ be a prefix pattern of length~$m$, and let
$\vec{g}(n,w)$ be the gap function
(Definition~\ref{def:gap-function}).  A vector
$\vec{v}\in\mathbb{N}^{m+1}$ is a \emph{gap vector} for~$p$ with
respect to~$\tau$ if, for all~$n$, the prefix set
$\Av_n(\tau)[p;w]=\varnothing$ whenever
$\vec{g}(n,w)\ge\vec{v}$ (i.e., $g_i\ge v_i$ for every
$i=0,\ldots,m$).
In other words, $\vec{v}$ is a threshold: whenever every gap around~$w$
has at least the prescribed number of available values, no extension
of~$w$ avoids~$\tau$.
Since the set of gap vectors is an upper order ideal in
$\mathbb{N}^{m+1}$ (if $\vec{v}$ is a gap vector, so is any
$\vec{u}\ge\vec{v}$), it suffices to record the minimal elements,
which form a \emph{basis}~$G$.
\end{definition}

\begin{example}\label{ex:gap-vector}
Let $\tau=123$ and $p=12$ (the increasing pair).  Then $m=2$ and
$\vec{g}(n,w)=(g_0,g_1,g_2)$.
If a prefix word $w=w_1w_2$ with $w_1<w_2$ extends to a
$123$-avoiding permutation, then there can be no value larger than
both $w_1$ and~$w_2$ (else $w_1<w_2<v$ forms a~$123$).  Hence
$\Av_n(123)[12;w]=\varnothing$ whenever $g_2(n,w)\ge 1$, giving the
gap vector $\vec{v}=(0,0,1)$.  This forms a basis:
$G_{12}=\{(0,0,1)\}$.
\end{example}

\begin{definition}[Reversibly deletable set]\label{def:reversible-deletion}
Let $\tau\in S_k$, let $p$ be a prefix pattern of length~$m$, and let
$R\subseteq[m]$.  The \emph{deletion map}~$d_R$ acts on three types
of objects by removing entries at the positions in~$R$:
\begin{itemize}
\item For a permutation $\pi\in S_n$,
  $d_R(\pi)=\mathrm{red}(\pi(1)\cdots\widehat{\pi(r_1)}\cdots\widehat{\pi(r_{|R|})}\cdots\pi(n))$
  (delete positions in~$R$, then standardize to a permutation of
  length $n-|R|$);
\item For the prefix pattern $p\in S_m$,
  $d_R(p)\in S_{m-|R|}$ is obtained by the same deletion and
  standardization (this is well-defined since $R\subseteq[m]$);
\item For a prefix word $w=w_1\cdots w_m$, $d_R(w)$ is the word
  obtained by deleting $w_r$ for each $r\in R$ and subtracting
  $|\{r'\in R:r'<r\}|$ from each remaining entry to preserve relative
  order.
\end{itemize}
The set~$R$ is \emph{reversibly deletable} for~$p$ with respect
to~$\tau$ if $d_R$ induces a bijection
\[
\Av_n(\tau)[p;w]\;\longrightarrow\;\Av_{n-|R|}(\tau)[d_R(p);d_R(w)]
\]
for every prefix word~$w$ that fails the gap vector criterion for
every $\vec{v}\in G$, where $G$ is a basis of gap vectors for~$p$
(Definition~\ref{def:gap-vector}).  Since $R\subseteq[m]$, we have
$|R|\le m$ and $d_R(p)$ is always well-defined (it is the empty
permutation when $|R|=m$).
\end{definition}

\begin{definition}[Enumeration scheme]\label{def:enum-scheme}
Let $\tau\in S_k$.  An \emph{enumeration scheme} for~$\tau$ (following
\cite{Zeilberger1998,Baxter2014}) is a set~$\mathcal{E}$ of triples
$(p,G,R)$, where $p$ is a prefix pattern
(Definition~\ref{def:prefix-pattern}), $G$ is a basis of gap vectors
for~$p$ (Definition~\ref{def:gap-vector}), and $R$ is a reversibly
deletable set for~$p$
(Definition~\ref{def:reversible-deletion}).  The set $\mathcal{E}$
must contain $(\varepsilon,\varnothing,\varnothing)$ and satisfy the
closure condition: for each $(p,G,R)\in\mathcal{E}$,
\begin{enumerate}[label=\textup{(\alph*)}]
\item if $R=\varnothing$ and $\vec{0}\notin G$, then for each child
  $p'$ of~$p$ there exists a triple $(p',G',R')\in\mathcal{E}$;
\item if $R\neq\varnothing$, then $(d_R(p),G',R')\in\mathcal{E}$
  for some $G'$ and~$R'$.
\end{enumerate}
The scheme computes $|\Av_n(\tau)|$ by a deterministic recurrence:
given a prefix word~$w$, the triple $(p,G,R)$ dictates that
$\Av_n(\tau)[p;w]=\varnothing$ if~$w$ satisfies a gap vector
criterion; provides a bijection to a smaller set via~$d_R$ if~$w$
fails all gap criteria and $R\neq\varnothing$; or partitions by
children if $R=\varnothing$.
\end{definition}

Baxter~\cite[Theorem~13]{Baxter2014}
proves that the right-to-left maximum count
$\rlmax(w):=|\RLM(w)|$ is
\emph{ES-compatible} with margin~$0$: the distribution of $\rlmax$
over $\Av_n(12\oplus\alpha)$ is determined by the enumeration scheme for
$12\oplus\alpha$ via a fixed refinement.
By Step~1 of the proof below, for $w\in\Av_n(12\oplus\alpha)$ the set
$\RLM(w)$ is the terminal interval $\{p_n,p_n{+}1,\ldots,n\}$, so the
count $|\RLM(w)|=n-p_n+1$ uniquely determines~$\RLM(w)$.
Thus the RLM-set distribution (equivalently, the sequence
$a_\alpha(n,p)$) is determined by the enumeration scheme.

We need one preparatory lemma.

\begin{lemma}[Constructiveness of enumeration schemes]\label{lem:constructive}
Let $\tau$ and~$\tau'$ be patterns whose enumeration schemes have
the same set of triples $(p,G,R)$.
Then $\Av_n(\tau)=\Av_n(\tau')$ for all~$n$.
\end{lemma}

\begin{proof}
By Definition~\ref{def:enum-scheme}, the scheme computes $\Av_n(\tau)$
by applying one of three rules to each prefix word~$w$: the gap
criterion (rule~1), the bijection via reversible deletion (rule~2), or
the partition by children (rule~3).  Each rule is deterministic — the
output depends only on the triple $(p,G,R)$ and previously computed
sets at smaller~$n$ (rule~2) or child prefixes at the same~$n$ (rule~3).
By induction on~$n$: the base case
$\Av_1(\tau)=\Av_1(\tau')=\{1\}$ is trivial.  If
$\Av_{n-1}(\tau)=\Av_{n-1}(\tau')$ and the triples $(p,G,R)$ are the
same, then the same rules apply at each step, producing
$\Av_n(\tau)=\Av_n(\tau')$.
\end{proof}

\begin{lemma}[Scheme injectivity]\label{lem:gap-injective}
Let $\alpha,\beta\in S_k$ with $\alpha\neq\beta$ and $k\ge 3$.
Then the enumeration schemes for $12\oplus\alpha$ and
$12\oplus\beta$ differ: there exists a triple $(p,G,R)$ in one scheme
that is not in the other.
\end{lemma}

\begin{proof}
Suppose for contradiction that the schemes for
$\tau=12\oplus\alpha$ and $\tau'=12\oplus\beta$ have the same triples
$(p,G,R)$.
By Lemma~\ref{lem:constructive}, the same triples produce the same
avoidance sets: $\Av_n(\tau)=\Av_n(\tau')$ for all~$n$.
But a permutation class is determined by its elements, so
$\tau=\tau'$, i.e., $12\oplus\alpha=12\oplus\beta$, hence
$\alpha=\beta$.
This contradicts $\alpha\neq\beta$.
\end{proof}

\begin{lemma}[Different triples give different sets]\label{lem:diff-triples}
Let $\tau$ and~$\tau'$ be patterns whose enumeration schemes have
different sets of triples $(p,G,R)$.  Then
$\Av_n(\tau)\neq\Av_n(\tau')$ for some~$n$.
\end{lemma}

\begin{proof}
We prove the contrapositive: if $\Av_n(\tau)=\Av_n(\tau')$ for
all~$n$, then the schemes have the same triples.
Let $E$ and~$E'$ be the two schemes.
By Definition~3 of~\cite{Baxter2014}, each scheme is a set of
triples $(p,G,R)$ satisfying the closure condition
(Definition~3(2)).  The set of prefix patterns appearing in $E$
is determined by the tree structure starting from~$\varepsilon$,
and is the same for both schemes (since the children of a prefix
$p$ depend only on~$p$, not on the pattern).

It remains to show that for each prefix~$p$, the gap vectors~$G$
and the reversibly deletable set~$R$ are the same in both schemes.
The scheme computes $s_n(\tau)[p;w]$ by reading the triple
$(p,G,R)$ and applying one of three rules (Section~2.3
of~\cite{Baxter2014}): the gap criterion (rule~1), the bijection
via reversible deletion (rule~2), or the partition by children
(rule~3).  The rule applied depends on $(p,G,R)$: rule~1 applies
when $w$ satisfies the gap criterion for some $\vec{v}\in G$;
rule~2 applies when $w$ fails all gap criteria and
$R\neq\varnothing$; rule~3 applies when $w$ fails all gap criteria
and $R=\varnothing$.

Since $s_n(\tau)[p;w]=s_n(\tau')[p;w]$ for all $n$, $p$, and~$w$
(by hypothesis), the rule applied must be the same in both schemes
for each~$w$:
\begin{itemize}
\item If $G\neq G'$, then some spacing vector $\vec{g}(n,w)$
  satisfies the gap criterion in one scheme but not the other,
  giving $s_n=0$ in one and $s_n>0$ in the other.  Contradiction.
\item If $G=G'$ but $R\neq R'$, then for $w$ failing all gap
  criteria, one scheme applies rule~2 (bijection to
  $S_{n-|R|}(\tau)[d_R(p);d_R(w)]$) while the other applies
  rule~2 with a different~$R$ or rule~3 (partition by children).
  These give different recurrences: rule~2 reduces $n$ by~$|R|$
  while rule~3 sums over children at the same~$n$.
  If the recurrences are to give the same result for all~$w$, the
  bijection targets and the partition children must produce
  identical counts, which forces $R=R'$ (since the bijection
  $d_R$ and the partition by children are different operations
  with different structures).
\end{itemize}
Therefore $G=G'$ and $R=R'$ for each prefix~$p$, so the schemes
have the same triples.
\end{proof}

\begin{proof}[Proof of Theorem~\ref{thm:rlm-refines-wilf}]

\medskip\noindent\textbf{Step~1: RLM sets are terminal intervals.}
Let $w\in\Av_n(12\oplus\alpha)$ with $w(p_n)=n$.  No position left
of~$p_n$ can be an RLM (since $n$ is larger and to the right), and
every position from $p_n$ onward is an RLM (since $n$ is the largest
element and lies to the left).  Hence
$\RLM(w) = \{p_n, p_n{+}1, \ldots, n\}$,
and the RLM distribution is encoded by
$a_\alpha(n,p):=|\{w\in\Av_n(12\oplus\alpha):p_n=p\}|$.

\medskip\noindent\textbf{Step~2: the $\sigma$-constraint.}
For $w$ with $p_n=p$ and $m=n-p$, each prefix element $w(i)$ with
$i<p$ must satisfy: the standardization of
$w(i),w(p{+}1),\ldots,w(n)$ avoids~$\alpha$.  Since the suffix is
decreasing, this standardization is
\[
\sigma_{m,r}
\;=\;
(r{+}1,\;m{+}1,\;m,\;\ldots,\;r{+}2,\;r,\;r{-}1,\;\ldots,\;1),
\]
where $r=|\{\text{suffix values} > w(i)\}|$.
The \emph{forbidden set}
$F_\alpha^{(m)}:=\{r:\sigma_{m,r}\text{ contains }\alpha\}$
depends on~$\alpha$.  For $k=3$:
\[
\begin{array}{c|cccccc}
\alpha          & 123 & 132 & 213 & 231 & 312 & 321 \\\hline
F_\alpha^{(2)}  & \varnothing & \{0,1\} & \varnothing & \varnothing & \{2\} & \{0,1,2\} \\
F_\alpha^{(3)}  & \varnothing & \{0,1,2\} & \varnothing & \varnothing & \{2,3\} & \{0,\ldots,3\}
\end{array}
\]
The $\sigma$-constraints partition the six patterns into classes
that grow finer with~$m$, but do not separate all pairs: for
instance $123$, $213$, and $231$ all have $F^{(m)}=\varnothing$
for all~$m$.

\medskip\noindent\textbf{Step~3: different $\alpha$ give different RLM distributions.}
By Lemma~\ref{lem:gap-injective}, the enumeration schemes for
$12\oplus\alpha$ and $12\oplus\beta$ have different triples
$(p,G,R)$.
By Lemma~\ref{lem:diff-triples}, different triples produce different
avoidance sets at some level, so
$\Av_n(12\oplus\alpha)\neq\Av_n(12\oplus\beta)$ for some~$n$, hence
$12\oplus\alpha\neq 12\oplus\beta$.

By the argument before Lemma~\ref{lem:constructive}, the RLM-set
distribution is determined by the enumeration scheme (via Baxter's
Theorem~13 and the terminal-interval property of Step~1).
Different schemes give different RLM distributions.
Therefore $\alpha\neq\beta$ implies that the RLM distributions of
$\Av(12\oplus\alpha)$ and $\Av(12\oplus\beta)$ differ.
\end{proof}

% \nocite{*}
\bibliographystyle{amsplain}
\bibliography{references}

\end{document}
