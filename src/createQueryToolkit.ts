import {
  QueryClient,
  QueryKey,
  useQuery,
  useInfiniteQuery,
  useIsFetching,
} from "react-query";
import { generateKey } from "./internal/generateKey";
import { returnByCondition } from "./internal/returnByCondition";
import {
  QueryToolkit,
  QueryToolkitInfiniteQueryType,
  QueryToolkitQueryType,
  QueryType,
  TQueryFunction,
} from "./types/query";

export function createQueryToolkit(queryClient: QueryClient) {
  function createQuery<TQueryFnArgs extends unknown[], TQueryFnReturn>(
    queryKey: QueryKey,
    queryFn: TQueryFunction<TQueryFnArgs, TQueryFnReturn>,
    options?: { passArgsToQueryKey?: boolean; queryType?: "query" }
  ): Omit<
    QueryToolkitQueryType<
      Parameters<typeof queryFn>,
      Awaited<ReturnType<ReturnType<typeof queryFn>>>,
      Error
    >,
    "useInfiniteQuery" | "fetchInfiniteQuery" | "prefetchInfiniteQuery"
  >;
  function createQuery<TQueryFnArgs extends unknown[], TQueryFnReturn>(
    queryKey: QueryKey,
    queryFn: TQueryFunction<TQueryFnArgs, TQueryFnReturn>,
    options?: { passArgsToQueryKey?: boolean; queryType?: "infiniteQuery" }
  ): Omit<
    QueryToolkitInfiniteQueryType<
      Parameters<typeof queryFn>,
      Awaited<ReturnType<ReturnType<typeof queryFn>>>,
      Error
    >,
    "useQuery" | "fetchQuery" | "prefetchQuery"
  >;
  function createQuery<TQueryFnArgs extends unknown[], TQueryFnReturn>(
    queryKey: QueryKey,
    queryFn: TQueryFunction<TQueryFnArgs, TQueryFnReturn>,
    options: { passArgsToQueryKey?: boolean; queryType?: QueryType } = {}
  ) {
    const { passArgsToQueryKey = true, queryType = "query" } = options;

    const isInfiniteQuery = queryType === "infiniteQuery";
    const returnOnQuery = returnByCondition(!isInfiniteQuery);
    const returnOnInfiniteQuery = returnByCondition(isInfiniteQuery);

    type TFnArgs = Parameters<typeof queryFn>;
    type TQueryFnResult = Awaited<ReturnType<ReturnType<typeof queryFn>>>;

    const keyGenerator = generateKey(queryKey);
    const getKey = (queryKey?: QueryKey, args?: QueryKey) =>
      keyGenerator([
        ...(queryKey ? queryKey : []),
        ...(passArgsToQueryKey && args ? args : []),
      ]);

    const handleHooks = (hook: any) => (args: TFnArgs, queryOptions: any) =>
      hook(
        getKey(queryOptions?.queryKey, args),
        queryFn(...args),
        queryOptions
      );

    const hooks: Partial<
      Pick<
        QueryToolkit<TFnArgs>,
        "useQuery" | "useInfiniteQuery" | "useIsFetching"
      >
    > = {
      useQuery: returnOnQuery(handleHooks(useQuery)),
      useInfiniteQuery: returnOnInfiniteQuery(handleHooks(useInfiniteQuery)),
      useIsFetching: (filters) =>
        useIsFetching(keyGenerator(filters?.queryKey), filters),
    };

    const handleFetchFunctions = (
      path: keyof QueryToolkit,
      conditionalReturnFunc: ReturnType<typeof returnByCondition>
    ) =>
      conditionalReturnFunc((args: any, options: any) =>
        (queryClient as any)[path](
          getKey(options?.queryKey, args),
          queryFn(...args),
          options
        )
      );

    const handler = new Proxy(hooks, {
      get(target: any, path: keyof QueryToolkit) {
        if (target[path]) return target[path];
        switch (path) {
          case "fetchQuery":
          case "prefetchQuery":
            return handleFetchFunctions(path, returnOnQuery);

          case "fetchInfiniteQuery":
          case "prefetchInfiniteQuery":
            return handleFetchFunctions(path, returnOnInfiniteQuery);

          case "getQueryData":
          case "getQueryState":
          case "setQueryData":
            return (queryKey: any, ...rest: any) =>
              (queryClient as any)[path](keyGenerator(queryKey), ...rest);

          default:
            if (!(queryClient as any)[path])
              throw new Error("unknown property is given");
            return (...args: any) => (queryClient as any)[path](...args);
        }
      },
    });

    if (isInfiniteQuery)
      return handler as Omit<
        QueryToolkitInfiniteQueryType<TFnArgs, TQueryFnResult, Error>,
        "useQuery" | "fetchQuery" | "prefetchQuery"
      >;

    return handler as Omit<
      QueryToolkitQueryType<TFnArgs, TQueryFnResult, Error>,
      "useInfiniteQuery" | "fetchInfiniteQuery" | "prefetchInfiniteQuery"
    >;
  }

  return createQuery;
}
