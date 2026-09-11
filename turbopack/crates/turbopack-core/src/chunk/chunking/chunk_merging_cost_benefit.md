# Should we merge a chunk?

By default, for our calculations we assume that there is a probability of 2/3 that
we request exactly 1 chunk group (`N = 1`) and a probability of 1/3 that we request
2 chunk groups (`N = 2`). This is a simplification, but it should be good enough
for our purposes and it is configurable using the chunking heuristics.

**UNMERGED CASE**

from the total of $\text{groups}$ chunk groups

- $a_{\text{groups}}$ chunk groups request a $a_{\text{size}}$ chunk
- $b_{\text{groups}}$ chunk groups request a $b_{\text{size}}$ chunk

but there is an overlapy of $o_{\text{groups}}$ between them, which request both chunks.

**MERGED CASE**

from the total of $\text{groups}$ chunk groups

- $a_{\text{rem}}$ chunk groups request a $a_{\text{size}}$ chunk
- $b_{\text{rem}}$ chunk groups request a $b_{\text{size}}$ chunk
- $o_{\text{groups}}$ chunk groups request the merged chunk of size $(a_{\text{size}} + b_{\text{size}})$

We want to compute the expected request count $e_{\text{req}}$ and the expected total requested size $e_{\text{size}}$ for the unmerged and merged case.
This will allow us to compare the two.

To compute that we compute the two cases $N = 1$ and $N = 2$ and combine them

$$
\begin{flalign*}
& \begin{aligned}
e_{\text{size}} &= P(N=1) \cdot e_{\text{size}}(N=1) + P(N=2) \cdot e_{\text{size}}(N=2) \\
e_{\text{req}} &= P(N=1) \cdot e_{\text{req}}(N=1) + P(N=2) \cdot e_{\text{req}}(N=2)
\end{aligned} &
\end{flalign*}
$$

We combine $e_{\text{size}}$ with $e_{\text{req}}$ using this formula:

$$
\begin{flalign*}
& e_{\text{cost}} = e_{\text{req}} \cdot c_{\text{req}} + e_{\text{size}} &
\end{flalign*}
$$

The constant $c_{\text{req}}$ is the cost of a single request in transferred bytes. We have to choose a good value for that since there is no real value of that.
This way we can compute a cost for both cases ($e_{\text{unmerged cost}}$ and $e_{\text{merged cost}}$).

With both costs we can compute the cost benefit $d$ of merging the two chunks:

$$
\begin{flalign*}
& d = e_{\text{unmerged cost}} - e_{\text{merged cost}} &
\end{flalign*}
$$

We can also split the formula into two parts:

$$
\begin{flalign*}
& \begin{aligned}
d &= d_{\text{req}} \cdot c_{\text{req}} + d_{\text{size}} \\
d_{\text{size}} &= e_{\text{unmerged size}} - e_{\text{merged size}} \\
d_{\text{req}} &= e_{\text{unmerged req}} - e_{\text{merged req}}
\end{aligned} &
\end{flalign*}
$$

And we can split it further for every $N$:

$$
\begin{flalign*}
& \begin{aligned}
d_{\text{size}} &= P(N=1) \cdot d_{\text{size}}(N=1) + P(N=2) \cdot d_{\text{size}}(N=2) \\
d_{\text{req}} &= P(N=1) \cdot d_{\text{req}}(N=1) + P(N=2) \cdot d_{\text{req}}(N=2)
\end{aligned} &
\end{flalign*}
$$

---

To compute $e_{\text{size}}$ and $e_{\text{req}}$ we need to determine all cases and their probabilities.

**UNMERGED CASE (N = 1):**

$$
\begin{flalign*}
& \begin{aligned}
& \textbf{case X} \\
& p = a_{\text{rem}}/\text{groups} \\
& \text{size} = a_{\text{size}} \\
& \text{requests} = 1 \\
& \\
& \textbf{case Y} \\
& p = b_{\text{rem}}/\text{groups} \\
& \text{size} = b_{\text{size}} \\
& \text{requests} = 1 \\
& \\
& \textbf{case Z} \\
& p = o_{\text{groups}}/\text{groups} \\
& \text{size} = a_{\text{size}} + b_{\text{size}} \\
& \text{requests} = 2
\end{aligned} &
\end{flalign*}
$$

**MERGED CASE (N = 1):**

$$
\begin{flalign*}
& \begin{aligned}
& \textbf{case X} \\
& p = a_{\text{rem}}/\text{groups} \\
& \text{size} = a_{\text{size}} \\
& \text{requests} = 1 \\
& \\
& \textbf{case Y} \\
& p = b_{\text{rem}}/\text{groups} \\
& \text{size} = b_{\text{size}} \\
& \text{requests} = 1 \\
& \\
& \textbf{case Z} \\
& p = o_{\text{groups}}/\text{groups} \\
& \text{size} = a_{\text{size}} + b_{\text{size}} \\
& \text{requests} = 1
\end{aligned} &
\end{flalign*}
$$

There is no difference in the sizes at all, so that means:

$$
\begin{flalign*}
& d_{\text{size}}(N=1) = 0 &
\end{flalign*}
$$

The only difference is in case $Z$ in the request count. That case has $p = o_{\text{groups}}/\text{groups}$:

$$
\begin{flalign*}
& \begin{aligned}
d_{\text{req}}(N=1) &= (o_{\text{groups}} / \text{groups}) \cdot (2 - 1) \\
d_{\text{req}}(N=1) &= o_{\text{groups}} / \text{groups} \\
d(N=1) &= d_{\text{req}}(N=1) \cdot c_{\text{req}} + d_{\text{size}}(N=1) \\
&= (o_{\text{groups}} \cdot c_{\text{req}}) / \text{groups}
\end{aligned} &
\end{flalign*}
$$

---

Each $N = 2$ case's probability $p$ is the probability of navigating
to a page in the first group, then from that page to the second
group. That second probability is the transition probability,
written $\text{trans}(1 \to 2)$.

Route "clusters" can be configured to signal that users are more
likely to navigate between pages in the same cluster. This changes
the transition probability. When no clusters are configured:

$$
\begin{flalign*}
& \begin{aligned}
\text{trans}(X \to X) &= (a_{\text{rem}} - 1)/(\text{groups} - 1) \\
\text{trans}(X \to Y) &= b_{\text{rem}}/(\text{groups} - 1) \\
\text{trans}(X \to Z) &= o_{\text{groups}}/(\text{groups} - 1) \\
\text{trans}(Y \to X) &= a_{\text{rem}}/(\text{groups} - 1) \\
\text{trans}(Y \to Y) &= (b_{\text{rem}} - 1)/(\text{groups} - 1) \\
\text{trans}(Y \to Z) &= o_{\text{groups}}/(\text{groups} - 1) \\
\text{trans}(Z \to X) &= a_{\text{rem}}/(\text{groups} - 1) \\
\text{trans}(Z \to Y) &= b_{\text{rem}}/(\text{groups} - 1) \\
\text{trans}(Z \to Z) &= (o_{\text{groups}} - 1)/(\text{groups} - 1)
\end{aligned} &
\end{flalign*}
$$

and the $N = 2$ cases reduce to:

$$
\begin{flalign*}
& \begin{aligned}
& \textbf{case X + X} \\
& p = (a_{\text{rem}}/\text{groups}) \cdot ((a_{\text{rem}} - 1)/(\text{groups} - 1)) \\
& \\
& \textbf{case Y + Y} \\
& p = (b_{\text{rem}}/\text{groups}) \cdot ((b_{\text{rem}} - 1)/(\text{groups} - 1)) \\
& \\
& \textbf{case Z + Z} \\
& p = (o_{\text{groups}}/\text{groups}) \cdot ((o_{\text{groups}} - 1)/(\text{groups} - 1)) \\
& \\
& \textbf{case X + Y} \\
& p = (a_{\text{rem}}/\text{groups}) \cdot (b_{\text{rem}}/(\text{groups} - 1)) + (b_{\text{rem}}/\text{groups}) \cdot (a_{\text{rem}}/(\text{groups} - 1)) \\
& \\
& \textbf{case X + Z} \\
& p = (a_{\text{rem}}/\text{groups}) \cdot (o_{\text{groups}}/(\text{groups} - 1)) + (o_{\text{groups}}/\text{groups}) \cdot (a_{\text{rem}}/(\text{groups} - 1)) \\
& \\
& \textbf{case Y + Z} \\
& p = (b_{\text{rem}}/\text{groups}) \cdot (o_{\text{groups}}/(\text{groups} - 1)) + (o_{\text{groups}}/\text{groups}) \cdot (b_{\text{rem}}/(\text{groups} - 1))
\end{aligned} &
\end{flalign*}
$$

$X$, $Y$ and $Z$ are three sets of chunk groups:

$$
\begin{flalign*}
& \begin{aligned}
X &= \text{the } a_{\text{rem}} \text{ groups that load only chunk A} \\
Y &= \text{the } b_{\text{rem}} \text{ groups that load only chunk B} \\
Z &= \text{the } o_{\text{groups}} \text{ groups that load both}
\end{aligned} &
\end{flalign*}
$$

Now, when clusters are configured, it is more complicated.

Two groups that sit in the same cluster form a "pair". The table below
counts the number of pairs that exist between groups. Each cell says
how many pairs have one group in one set and the other group in another
set. The diagonal cells ($c_{xx}$, $c_{yy}$, $c_{zz}$) count pairs where
the paired groups are in the same set.

$$
\begin{flalign*}
& \begin{array}{c|ccc}
 & X\\,(a_{\text{rem}}) & Y\\,(b_{\text{rem}}) & Z\\,(\text{overlap}) \\
\hline
X\\,(a_{\text{rem}})   & c_{xx} & c_{xy} & c_{xz} \\
Y\\,(b_{\text{rem}})   & c_{xy} & c_{yy} & c_{yz} \\
Z\\,(\text{overlap})   & c_{xz} & c_{yz} & c_{zz}
\end{array} &
\end{flalign*}
$$

Each row sum is the total number of pairs leaving that set:

$$
\begin{flalign*}
& \begin{aligned}
\text{paired}\_x &= c\_{xx} + c\_{xy} + c\_{xz} \\
\text{paired}\_y &= c\_{xy} + c\_{yy} + c\_{yz} \\
\text{paired}\_z &= c\_{xz} + c\_{yz} + c\_{zz}
\end{aligned} &
\end{flalign*}
$$

`CLUSTER_NAVIGATION_PROBABILITY` ($= 0.6$, written as $\text{cnp}$ below) is the chance a
navigation stays within a cluster.

For a first group in set 1, $\text{trans}(1 \to 2)$ can be calculated using
the following probability tree:

```
                    Will the navigation stay
                       within a cluster?
                    /                    \
             yes (cnp)                 no (1 - cnp)
                  /                        \
       Does it go to set 2?         Does it go to set 2?
                |                            |
         c_12 / paired_1      non_paired_12 / non_paired_1
```

$\text{non\\_paired}\_{12}$ is the amount of navigations from set 1 into set 2
that are not within a cluster, and $\text{non\\_paired}\_1$ is the total
number of unpaired navigations leaving set 1:

$$
\begin{flalign*}
& \begin{aligned}
\text{non\\_paired}\_{12} &= |S_1| \cdot |S_2| - c\_{12} \\
\text{non\\_paired}\_1 &= (\text{groups} - 1) \cdot |S_1| - \text{paired}\_1
\end{aligned} &
\end{flalign*}
$$

When set 1 and set 2 are the same set, the $|S_1|$ in $\text{non\\_paired}\_{12}$
becomes $|S_1| - 1$, since a group cannot navigate to itself. The $|S_1|$ in
$\text{non\\_paired}\_1$ is unchanged, as every group is still a possible
starting point.

Therefore:

$$
\begin{flalign*}
& \text{trans}(1 \to 2) = \text{cnp} \cdot (c\_{12} / \text{paired}\_1) + (1 - \text{cnp}) \cdot (\text{non\\_paired}\_{12} / \text{non\\_paired}\_1) &
\end{flalign*}
$$

To prevent dividing by zero, if $\text{paired}\_1 = 0$ then
$\text{trans}(1 \to 2) = |S_2| / (\text{groups} - 1)$, and if $\text{non\\_paired}\_1 = 0$
then $\text{trans}(1 \to 2) = c\_{12} / \text{paired}\_1$.

---

In terms of transition probabilities, $d$ is:

**UNMERGED CASE (N = 2):**

$$
\begin{flalign*}
& \begin{aligned}
& \textbf{case X + X} \\
& p = (a_{\text{rem}}/\text{groups}) \cdot \text{trans}(X \to X) \\
& \text{size} = a_{\text{size}} \\
& \text{requests} = 1 \\
& \\
& \textbf{case Y + Y} \\
& p = (b_{\text{rem}}/\text{groups}) \cdot \text{trans}(Y \to Y) \\
& \text{size} = b_{\text{size}} \\
& \text{requests} = 1 \\
& \\
& \textbf{case Z + Z} \\
& p = (o_{\text{groups}}/\text{groups}) \cdot \text{trans}(Z \to Z) \\
& \text{size} = a_{\text{size}} + b_{\text{size}} \\
& \text{requests} = 2 \\
& \\
& \textbf{case X + Y} \\
& p = (a_{\text{rem}}/\text{groups}) \cdot \text{trans}(X \to Y) + (b_{\text{rem}}/\text{groups}) \cdot \text{trans}(Y \to X) \\
& \text{size} = a_{\text{size}} + b_{\text{size}} \\
& \text{requests} = 2 \\
& \\
& \textbf{case X + Z} \\
& p = (a_{\text{rem}}/\text{groups}) \cdot \text{trans}(X \to Z) + (o_{\text{groups}}/\text{groups}) \cdot \text{trans}(Z \to X) \\
& \text{size} = a_{\text{size}} + b_{\text{size}} \\
& \text{requests} = 2 \\
& \\
& \textbf{case Y + Z} \\
& p = (b_{\text{rem}}/\text{groups}) \cdot \text{trans}(Y \to Z) + (o_{\text{groups}}/\text{groups}) \cdot \text{trans}(Z \to Y) \\
& \text{size} = a_{\text{size}} + b_{\text{size}} \\
& \text{requests} = 2
\end{aligned} &
\end{flalign*}
$$

**MERGED CASE (N = 2):**

$$
\begin{flalign*}
& \begin{aligned}
& \textbf{case X + X} \\
& p = (a_{\text{rem}}/\text{groups}) \cdot \text{trans}(X \to X) \\
& \text{size} = a_{\text{size}} \\
& \text{requests} = 1 \\
& \\
& \textbf{case Y + Y} \\
& p = (b_{\text{rem}}/\text{groups}) \cdot \text{trans}(Y \to Y) \\
& \text{size} = b_{\text{size}} \\
& \text{requests} = 1 \\
& \\
& \textbf{case Z + Z} \\
& p = (o_{\text{groups}}/\text{groups}) \cdot \text{trans}(Z \to Z) \\
& \text{size} = (a_{\text{size}} + b_{\text{size}}) \\
& \text{requests} = 1 \\
& \\
& \textbf{case X + Y} \\
& p = (a_{\text{rem}}/\text{groups}) \cdot \text{trans}(X \to Y) + (b_{\text{rem}}/\text{groups}) \cdot \text{trans}(Y \to X) \\
& \text{size} = a_{\text{size}} + b_{\text{size}} \\
& \text{requests} = 2 \\
& \\
& \textbf{case X + Z} \\
& p = (a_{\text{rem}}/\text{groups}) \cdot \text{trans}(X \to Z) + (o_{\text{groups}}/\text{groups}) \cdot \text{trans}(Z \to X) \\
& \text{size} = a_{\text{size}} + (a_{\text{size}} + b_{\text{size}}) \\
& \text{requests} = 2 \\
& \\
& \textbf{case Y + Z} \\
& p = (b_{\text{rem}}/\text{groups}) \cdot \text{trans}(Y \to Z) + (o_{\text{groups}}/\text{groups}) \cdot \text{trans}(Z \to Y) \\
& \text{size} = b_{\text{size}} + (a_{\text{size}} + b_{\text{size}}) \\
& \text{requests} = 2
\end{aligned} &
\end{flalign*}
$$

Request count is different in this case: $Z + Z$ (better)

Requests size is different (worse) in these cases: $X + Z$, $Y + Z$

$$
\begin{flalign*}
& \begin{aligned}
d_{\text{req } Z+Z} &= ((o_{\text{groups}}/\text{groups}) \cdot \text{trans}(Z \to Z)) \cdot (2 - 1) \\
&= (o_{\text{groups}}/\text{groups}) \cdot \text{trans}(Z \to Z)
\end{aligned} &
\end{flalign*}
$$

$$
\begin{flalign*}
& d_{\text{req}}(N=2) = (o_{\text{groups}}/\text{groups}) \cdot \text{trans}(Z \to Z) &
\end{flalign*}
$$

$$
\begin{flalign*}
& \begin{aligned}
d_{\text{size } X+Z} &= ((a_{\text{rem}}/\text{groups}) \cdot \text{trans}(X \to Z) + (o_{\text{groups}}/\text{groups}) \cdot \text{trans}(Z \to X)) \cdot (a_{\text{size}} + b_{\text{size}} - (a_{\text{size}} + (a_{\text{size}} + b_{\text{size}}))) \\
&= ((a_{\text{rem}}/\text{groups}) \cdot \text{trans}(X \to Z) + (o_{\text{groups}}/\text{groups}) \cdot \text{trans}(Z \to X)) \cdot (-a_{\text{size}}) \\
&= -a_{\text{size}} \cdot (a_{\text{rem}} \cdot \text{trans}(X \to Z) + o_{\text{groups}} \cdot \text{trans}(Z \to X)) / \text{groups} \\
& \\
d_{\text{size } Y+Z} &= -b_{\text{size}} \cdot (b_{\text{rem}} \cdot \text{trans}(Y \to Z) + o_{\text{groups}} \cdot \text{trans}(Z \to Y)) / \text{groups}
\end{aligned} &
\end{flalign*}
$$

$$
\begin{flalign*}
& \begin{aligned}
d_{\text{size}}(N=2) &= -(a_{\text{size}} \cdot (a_{\text{rem}} \cdot \text{trans}(X \to Z) + o_{\text{groups}} \cdot \text{trans}(Z \to X)) \\
&\quad + b_{\text{size}} \cdot (b_{\text{rem}} \cdot \text{trans}(Y \to Z) + o_{\text{groups}} \cdot \text{trans}(Z \to Y))) / \text{groups}
\end{aligned} &
\end{flalign*}
$$

$$
\begin{flalign*}
& \begin{aligned}
d(N=2) &= d_{\text{req}}(N=2) \cdot c_{\text{req}} + d_{\text{size}}(N=2) \\
&= (o_{\text{groups}} \cdot \text{trans}(Z \to Z) \cdot c_{\text{req}} \\
&\quad - a_{\text{size}} \cdot (a_{\text{rem}} \cdot \text{trans}(X \to Z) + o_{\text{groups}} \cdot \text{trans}(Z \to X)) \\
&\quad - b_{\text{size}} \cdot (b_{\text{rem}} \cdot \text{trans}(Y \to Z) + o_{\text{groups}} \cdot \text{trans}(Z \to Y))) / \text{groups}
\end{aligned} &
\end{flalign*}
$$

---

Finally,

$$
\begin{flalign*}
& d = P(N=1) \cdot d(N=1) + P(N=2) \cdot d(N=2) &
\end{flalign*}
$$
