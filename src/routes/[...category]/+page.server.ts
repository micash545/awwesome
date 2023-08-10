import { createQuery } from '../../lib/query';
import type { Category, GithubRepo, Project, ProjectCollection } from '../../lib/types/types';
import { getAllCategories, getProjectsFromAwesomeList } from '../../lib/repositories';
import { fetchRepoInfoFromGithub } from '../../lib/fetch-github';
import { dev } from '$app/environment';
import { chunkSize, removeTrailingSlashes } from '../../lib';

function transformObjectToArray(categories: Category[]): { category: string }[] {
	const array = [];

	categories.forEach((category) => {
		let entry = [{ category: category.slug }];
		if (category.children && category.children?.length > 0) {
			entry = entry.concat(transformObjectToArray(category.children));
		}
		array.concat(entry);
	});

	return array;
}

export async function entries() {
	console.log('creating entries function');
	const result = await getAllCategories();

	const items = transformObjectToArray(result);
	console.log(items);
	return [{ category: '' }].concat(items);
}

let allProjects: Project[] = [];
let loaded = false;

export async function load({ params }): Promise<ProjectCollection> {
	const category: string[] = removeTrailingSlashes(params.category)?.split('/');
	console.log('creating load function, category: ', category);
	if (allProjects.length === 0) {
		allProjects = await getProjectsFromAwesomeList();
	}

	let data: GithubRepo[] = [];
	if (!loaded) {
		for (let i = 0; i < allProjects.length; i += chunkSize) {
			const start = performance.now();

			const chunk = allProjects.slice(i, i + chunkSize);
			const query = await createQuery(chunk);
			const result = await fetchRepoInfoFromGithub(query);
			data = data.concat(result);
			const end = performance.now();
			console.log(
				`fetched ${result.length} repository information from Github in ${end - start}ms`
			);

			if (dev) {
				break; // in development its faster to only do one fetch
			}
		}

		allProjects.map((project) => {
			const repo = data.find(
				(repo) => repo.url === project.primary_url || repo.url === project.source_url
			);
			if (!repo) {
				return project;
			}

			project.stars = repo.stargazerCount;
			project.description = repo.descriptionHTML ?? project.description;
			project.avatar_url = repo.owner?.avatarUrl;
			project.commit_history = repo.defaultBranchRef.target;
			// const lastCommit = repo.defaultBranchRef?.target?.history?.edges?.[0].node?.authoredDate;
			// lastCommit ? (project.last_commit = new Date(lastCommit)) : null;
			return project;
		});
		loaded = true;
	}

	let filteredProjects: Project[] = allProjects;
	if (category) {
		filteredProjects = filteredProjects.filter((project) => {
			if (typeof category === 'undefined' || !project.category) {
				return false;
			}
			return category.every((categoryPart, index) => {
				return project.category?.[index]?.slug === categoryPart;
			});
		});
	}

	const sortedProjects = filteredProjects.sort((a, b) => {
		const starsA = a.stars || 0;
		const starsB = b.stars || 0;
		return starsB - starsA;
	});

	return { projects: sortedProjects, categories: await getAllCategories() };
}

export const prerender = true;