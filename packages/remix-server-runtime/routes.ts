import invariant from "./invariant";
import type { ServerRouteModule } from "./routeModules";

export interface RouteManifest<Route> {
  [routeId: string]: Route;
}

export type ServerRouteManifest = RouteManifest<Omit<ServerRoute, "children">>;

// NOTE: make sure to change the Route in remix-react if you change this
interface Route {
  index?: boolean;
  caseSensitive?: boolean;
  id: string;
  parentId?: string;
  path?: string;
}

// NOTE: make sure to change the EntryRoute in remix-react if you change this
export interface EntryRoute extends Route {
  hasAction: boolean;
  hasLoader: boolean;
  hasCatchBoundary: boolean;
  hasErrorBoundary: boolean;
  imports?: string[];
  module: string;
}

export interface ServerRoute extends Route {
  children: ServerRoute[];
  module: ServerRouteModule;
}

// https://github.com/remix-run/remix/discussions/3014
// https://github.com/remix-run/react-router/issues/9145
interface BaseManifestRoute {
  id: string;
  path?: string;
  parentId?: string;
}

interface BaseHierarchyRoute {
  id: string;
  path?: string;
  children?: BaseHierarchyRoute[];
}

/**
 * NOTE: This function is duplicated in remix-dev, remix-react, and
 * remix-server-runtime so if you make changes please make them in all 3
 * locations. We'll look into DRY-ing this up after we layer Remix on top of
 * react-router@6.4
 *
 * Generic reusable function to convert a manifest into a react-router style
 * route hierarchy.  For use in server-side and client-side route creation,
 * as well and `remix routes` to keep them all in sync.
 *
 * This also handles inserting "folder" parent routes to help disambiguate
 * between pathless layout routes and index routes at the same level
 *
 * @param manifest     Map of string -> Route Object
 * @param createRoute  Function to create a hierarchical route given a manifest
 *                     ignoring children
 * @returns
 */
export function createHierarchicalRoutes<
  ManifestRoute extends BaseManifestRoute,
  HierarchyRoute extends BaseHierarchyRoute
>(
  manifest: Record<string, ManifestRoute>,
  createRoute: (r: ManifestRoute) => HierarchyRoute
) {
  function recurse(parentId?: string) {
    let routes = Object.values(manifest).filter(
      (route) => route.parentId === parentId
    );

    let children: HierarchyRoute[] = [];
    let pathCounts: Record<string, number> = {};

    for (let route of routes) {
      // Track in case we find duplicate paths and the same level, indicating
      // we need to insert a folder route
      if (route.path) {
        pathCounts[route.path] = (pathCounts[route.path] || 0) + 1;
      }
      let hierarchicalRoute = createRoute(route);
      hierarchicalRoute.children = recurse(route.id);
      children.push(hierarchicalRoute);
    }

    // If we found any duplicate paths, create a new folder-route and nest
    // the duplicate entires under that without paths since they inherit
    // from the new parent now
    Object.entries(pathCounts).forEach(([path, count]) => {
      if (count > 1) {
        let otherPathRoutes: HierarchyRoute[] = [];
        let dupPathRoutes: HierarchyRoute[] = [];
        children.forEach((r) => {
          if (r.path === path) {
            dupPathRoutes.push(r);
          } else {
            otherPathRoutes.push(r);
          }
        });
        // TODO: Need to figure out this typing error :/
        let folderRoute: HierarchyRoute = {
          id: `folder:routes/${path}`,
          path,
          children: dupPathRoutes.map((r) => ({ ...r, path: undefined })),
        };
        children = [...otherPathRoutes, folderRoute];
      }
    });

    return children;
  }

  return recurse();
}
