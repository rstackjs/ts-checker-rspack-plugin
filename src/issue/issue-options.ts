import type { IssueMatch } from './issue-match';
import type { IssuePredicate } from './issue-predicate';
import type { IssueDefaultSeverity } from './issue-severity';

type IssuePredicateOption = IssuePredicate | IssueMatch | (IssuePredicate | IssueMatch)[];

interface IssueOptions {
  include?: IssuePredicateOption;
  exclude?: IssuePredicateOption;
  defaultSeverity?: IssueDefaultSeverity;
}

export type { IssueOptions, IssuePredicateOption };
