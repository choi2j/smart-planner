import { useState, useEffect } from "react";

interface User {
	id: string;
	email: string;
}

interface Plan {
	title: string | "";
	description: string | "";
	due_date: string | "";
	due_time: string | "";
	location: string | "";
	priority: string | "";
	status: boolean;
}

interface ApiResponse {
	original_message: string;
	todo_count: number;
	todos: Plan[];
}

function App() {
	const [inputValue, setInputValue] = useState("");
	const [save, setSave] = useState<Plan[]>([]);
	const [sortOrder, setSortOrder] = useState<"date-asc" | "date-desc" | "none">("none");
	const [editingIndex, setEditingIndex] = useState<number | null>(null);
	const [editValues, setEditValues] = useState<Plan | null>(null);

	const [user, setUser] = useState<User | null>(null);
	const [accessToken, setAccessToken] = useState<string | null>(null);
	const [showLoginModal, setShowLoginModal] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	// Load token and user from localStorage on mount
	useEffect(() => {
		const loadAuthFromStorage = async () => {
			const urlParams = new URLSearchParams(window.location.search);
			const authCode = urlParams.get("code");

			const hashParams = new URLSearchParams(window.location.hash.substring(1));
			const accessTokenFromHash = hashParams.get("access_token");
			const refreshToken = hashParams.get("refresh_token");
			const errorParam = hashParams.get("error") || urlParams.get("error");
			const errorDescription = hashParams.get("error_description") || urlParams.get("error_description");

			if (errorParam) {
				console.error("OAuth Error:", errorParam, errorDescription);
				alert(`로그인 오류: ${errorDescription || errorParam}`);
				window.history.replaceState({}, document.title, window.location.pathname);
				setIsLoading(false);
				return;
			}

			// Handle authorization code flow
			if (authCode) {
				try {
					const response = await fetch(`http://127.0.0.1:8000/auth/callback?code=${authCode}`);

					if (response.ok) {
						const data = await response.json();
						localStorage.setItem("access_token", data.access_token);
						localStorage.setItem("refresh_token", data.refresh_token);
						localStorage.setItem("user", JSON.stringify({ id: data.user.id, email: data.user.email }));

						setAccessToken(data.access_token);
						setUser({ id: data.user.id, email: data.user.email });
						await loadTodos(data.access_token);
						window.history.replaceState({}, document.title, window.location.pathname);
						alert("로그인 성공!");
					} else {
						const errorText = await response.text();
						console.error("Failed to exchange code. Status:", response.status);
						console.error("Error response:", errorText);
						alert("코드 교환 실패. 콘솔을 확인하세요.");
						window.history.replaceState({}, document.title, window.location.pathname);
					}
				} catch (error) {
					console.error("Failed to process authorization code:", error);
					alert("로그인 처리 중 오류가 발생했습니다. 콘솔을 확인하세요.");
					window.history.replaceState({}, document.title, window.location.pathname);
				}

				setIsLoading(false);
				return;
			}

			// Handle implicit flow (if tokens are in hash)
			if (accessTokenFromHash) {
				try {
					const userResponse = await fetch("http://127.0.0.1:8000/auth/me", {
						headers: {
							Authorization: `Bearer ${accessTokenFromHash}`,
						},
					});

					if (userResponse.ok) {
						const userData = await userResponse.json();
						localStorage.setItem("access_token", accessTokenFromHash);
						if (refreshToken) {
							localStorage.setItem("refresh_token", refreshToken);
						}
						localStorage.setItem("user", JSON.stringify({ id: userData.id, email: userData.email }));

						setAccessToken(accessTokenFromHash);
						setUser({ id: userData.id, email: userData.email });
						await loadTodos(accessTokenFromHash);
						window.history.replaceState({}, document.title, window.location.pathname);
						alert("로그인 성공!");
					} else {
						const errorText = await userResponse.text();
						console.error("Failed to get user info. Status:", userResponse.status);
						console.error("Error response:", errorText);
						throw new Error("Failed to get user info");
					}
				} catch (error) {
					console.error("Failed to process OAuth callback:", error);
					alert("로그인 처리 중 오류가 발생했습니다. 콘솔을 확인하세요.");
					window.history.replaceState({}, document.title, window.location.pathname);
				}
			} else {
				const storedToken = localStorage.getItem("access_token");
				const storedUser = localStorage.getItem("user");

				if (storedToken && storedUser) {
					setAccessToken(storedToken);
					setUser(JSON.parse(storedUser));
					await loadTodos(storedToken);
				}
			}

			setIsLoading(false);
		};

		loadAuthFromStorage();
	}, []);

	// Auto-save todos when save state changes (debounced)
	useEffect(() => {
		if (user && accessToken && save.length > 0) {
			const timer = setTimeout(() => {
				saveTodos();
			}, 2000); // Auto-save 2 seconds after changes

			return () => clearTimeout(timer);
		}
	}, [save, user, accessToken]);

	const handleLogin = async (provider: string) => {
		try {
			const response = await fetch("http://127.0.0.1:8000/auth/oauth/login", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ provider }),
			});

			const data = await response.json();

			if (data.url) {
				window.location.href = data.url;
			} else {
				console.error("No OAuth URL received from backend");
				alert("로그인 URL을 받지 못했습니다.");
			}
		} catch (error) {
			console.error("Login failed:", error);
			alert("로그인 실패!");
		}
	};

	const handleLogout = () => {
		localStorage.removeItem("access_token");
		localStorage.removeItem("user");
		setAccessToken(null);
		setUser(null);
		setSave([]);
		alert("로그아웃되었습니다.");
	};

	const saveTodos = async () => {
		if (!accessToken || save.length === 0) return;

		try {
			const response = await fetch("http://127.0.0.1:8000/todos/save", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
				},
				body: JSON.stringify({ todos: save }),
			});

			if (!response.ok) throw new Error("Failed to save todos");
			console.log("Todos saved successfully");
		} catch (error) {
			console.error("Failed to save todos:", error);
		}
	};

	const loadTodos = async (token?: string) => {
		const authToken = token || accessToken;
		if (!authToken) return;

		try {
			const response = await fetch("http://127.0.0.1:8000/todos/load", {
				method: "GET",
				headers: {
					Authorization: `Bearer ${authToken}`,
				},
			});

			if (!response.ok) throw new Error("Failed to load todos");

			const todos: Plan[] = await response.json();
			setSave(todos);
			console.log("Todos loaded successfully");
		} catch (error) {
			console.error("Failed to load todos:", error);
		}
	};

	const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
		setInputValue(event.target.value);
	};

	const handleSubmit = async () => {
		if (!inputValue) {
			console.error("전송할 값이 필요합니다.");
			return;
		}
		console.log(inputValue);

		try {
			const response = await fetch("http://127.0.0.1:8000/todo-request", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					message: String(inputValue),
				}),
			});

			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

			const data: ApiResponse = await response.json();
			console.log(data);
			alert("데이터 전송 성공!");

			setSave((prevSave) => [...prevSave, ...data.todos]);
			setInputValue("");
		} catch (error) {
			console.error(error);
			alert("데이터 전송 실패!");
		}
	};

	const handleToggleStatus = (index: number) => {
		const sortedList = getSortedPlans();
		const originalIndex = save.findIndex((item) => item === sortedList[index]);
		const updatedSave = [...save];
		updatedSave[originalIndex].status = !updatedSave[originalIndex].status;
		setSave(updatedSave);
	};

	const handleRemove = (index: number) => {
		const sortedList = getSortedPlans();
		const originalIndex = save.findIndex((item) => item === sortedList[index]);
		const updatedSave = save.filter((_, i) => i !== originalIndex);
		setSave(updatedSave);
	};

	const handleStartEdit = (index: number) => {
		setEditingIndex(index);
		setEditValues({ ...getSortedPlans()[index] });
	};

	const handleCancelEdit = () => {
		setEditingIndex(null);
		setEditValues(null);
	};

	const handleSaveEdit = (index: number) => {
		if (editValues) {
			const sortedList = getSortedPlans();
			const originalIndex = save.findIndex((item) => item === sortedList[index]);
			const updatedSave = [...save];
			updatedSave[originalIndex] = editValues;
			setSave(updatedSave);
		}
		setEditingIndex(null);
		setEditValues(null);
	};

	const handleEditChange = (field: keyof Plan, value: string) => {
		if (editValues) {
			setEditValues({ ...editValues, [field]: value });
		}
	};

	const getSortedPlans = () => {
		if (sortOrder === "none") return save;

		const sorted = [...save].sort((a, b) => {
			// Items without dates go to the end
			if (!a.due_date && !b.due_date) return 0;
			if (!a.due_date) return 1;
			if (!b.due_date) return -1;

			// Parse dates for comparison
			const dateA = new Date(a.due_date + (a.due_time ? ` ${a.due_time}` : ""));
			const dateB = new Date(b.due_date + (b.due_time ? ` ${b.due_time}` : ""));

			if (sortOrder === "date-asc") {
				return dateA.getTime() - dateB.getTime();
			} else {
				return dateB.getTime() - dateA.getTime();
			}
		});

		return sorted;
	};

	const formatDate = (dateString: string) => {
		if (!dateString) return "";
		try {
			const date = new Date(dateString);
			if (isNaN(date.getTime())) return dateString; // Return original if invalid

			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
			const weekday = weekdays[date.getDay()];

			return `${year}년 ${month}월 ${day}일 (${weekday})`;
		} catch {
			return dateString; // Return original if formatting fails
		}
	};

	const formatTime = (timeString: string) => {
		if (!timeString) return "";
		try {
			// Handle various time formats
			const timeMatch = timeString.match(/(\d{1,2}):(\d{2})/);
			if (timeMatch) {
				const hours = parseInt(timeMatch[1]);
				const minutes = timeMatch[2];
				const period = hours >= 12 ? "오후" : "오전";
				const displayHours = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
				return `${period} ${displayHours}:${minutes}`;
			}
			return timeString; // Return original if no match
		} catch {
			return timeString;
		}
	};

	const getPriorityColor = (priority: string) => {
		switch (priority.toLowerCase()) {
			case "높음":
			case "high":
				return "border-red-500 text-red-700 bg-red-50";
			case "중간":
			case "medium":
				return "border-yellow-500 text-yellow-700 bg-yellow-50";
			case "낮음":
			case "low":
				return "border-green-500 text-green-700 bg-green-50";
			default:
				return "border-gray-900 text-gray-900 bg-white";
		}
	};

	if (isLoading) {
		const hasHashParams = window.location.hash.includes("access_token");

		return (
			<div className="min-h-screen bg-white flex items-center justify-center">
				<div className="text-center">
					<p className="text-gray-600 text-lg">
						{hasHashParams ? "로그인 처리 중..." : "로딩 중..."}
					</p>
					{hasHashParams && (
						<p className="text-gray-400 text-sm mt-2">잠시만 기다려주세요</p>
					)}
				</div>
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-gray-50">
			{/* Login Modal */}
			{showLoginModal && (
				<div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
					<div className="bg-white border-2 border-gray-300 p-8 max-w-md w-full mx-4">
						<div className="text-center mb-6">
							<h2 className="text-2xl font-bold text-gray-900 mb-2">로그인</h2>
							<p className="text-gray-600">소셜 계정으로 간편하게 로그인하세요</p>
						</div>

						<div className="space-y-3">
							<button
								onClick={() => handleLogin("google")}
								className="w-full px-6 py-3 bg-white border-2 border-gray-900 text-gray-900 font-medium hover:bg-gray-100 transition-colors"
							>
								Google로 로그인
							</button>

							<button
								onClick={() => handleLogin("github")}
								className="w-full px-6 py-3 bg-gray-900 border-2 border-gray-900 text-white font-medium hover:bg-gray-800 transition-colors"
							>
								GitHub로 로그인
							</button>
						</div>

						<button
							onClick={() => setShowLoginModal(false)}
							className="mt-6 w-full px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors"
						>
							취소
						</button>
					</div>
				</div>
			)}

			<div className="container mx-auto px-4 py-8 max-w-4xl">
				{/* Header */}
				<div className="text-center mb-8">
					{window.location.hostname === "127.0.0.1" && (
						<div className="mb-4 p-3 bg-white border-2 border-gray-900">
							<p className="text-sm text-gray-900 font-medium">
								로그인이 작동하지 않으면{" "}
								<a href="http://localhost:5173" className="underline font-bold">
									localhost:5173
								</a>
								을 사용하세요
							</p>
						</div>
					)}

					<div className="flex items-center justify-between mb-4">
						<div className="flex-1"></div>
						<h1 className="text-4xl font-bold text-gray-900">Smart Planner</h1>
						<div className="flex-1 flex justify-end">
							{user ? (
								<div className="flex items-center gap-3">
									<div className="text-right">
										<p className="text-sm font-medium text-gray-900">{user.email}</p>
										<button
											onClick={handleLogout}
											className="text-xs text-gray-600 hover:text-gray-900 font-medium underline"
										>
											로그아웃
										</button>
									</div>
								</div>
							) : (
								<button
									onClick={() => setShowLoginModal(true)}
									className="px-4 py-2 bg-gray-900 border-2 border-gray-900 text-white font-medium hover:bg-gray-800 transition-colors"
								>
									로그인
								</button>
							)}
						</div>
					</div>
					<p className="text-gray-600">AI가 당신의 일정을 스마트하게 관리합니다</p>
					{user && (
						<p className="text-sm text-gray-500 mt-2">자동 저장 활성화</p>
					)}
				</div>

				{/* Input Section */}
				<div className="bg-white border-2 border-gray-300 p-6 mb-8">
					<div className="flex flex-col sm:flex-row gap-3">
						<input
							type="text"
							value={inputValue}
							onChange={handleInput}
							placeholder="할 일을 입력하세요... (예: 내일 오후 3시에 회의)"
							className="flex-1 px-4 py-3 border-2 border-gray-300 focus:outline-none focus:border-gray-900 transition-colors"
							onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
						/>
						<button
							onClick={handleSubmit}
							className="px-6 py-3 bg-gray-900 border-2 border-gray-900 text-white font-medium hover:bg-gray-800 transition-colors"
						>
							전송
						</button>
					</div>
				</div>

				{/* Plans Section */}
				<div className="bg-white border-2 border-gray-300 p-6">
					<div className="flex items-center justify-between mb-6 flex-wrap gap-3">
						<h3 className="text-2xl font-bold text-gray-900">
							할 일 목록
						</h3>
						<div className="flex items-center gap-3">
							{save.length > 0 && (
								<>
									<div className="flex items-center gap-2 bg-white px-3 py-1.5 border-2 border-gray-300">
										<label className="text-sm text-gray-700 font-medium">정렬:</label>
										<select
											value={sortOrder}
											onChange={(e) => setSortOrder(e.target.value as "date-asc" | "date-desc" | "none")}
											className="bg-transparent text-sm font-medium text-gray-900 focus:outline-none cursor-pointer"
										>
											<option value="none">기본</option>
											<option value="date-asc">날짜 오름차순</option>
											<option value="date-desc">날짜 내림차순</option>
										</select>
									</div>
									<span className="px-3 py-1 bg-white border-2 border-gray-900 text-gray-900 text-sm font-medium">
										{save.length}개
									</span>
								</>
							)}
						</div>
					</div>

					{save.length === 0 ? (
						<div className="text-center py-12">
							<p className="text-gray-500 text-lg">
								아직 할 일이 없습니다. 위에 입력해보세요!
							</p>
						</div>
					) : (
						<div className={`space-y-4 ${save.length > 4 ? "max-h-[600px] overflow-y-auto pr-2" : ""}`}>
							{getSortedPlans().map((plan, index) => (
								<div
									key={index}
									className={`border-2 border-gray-300 p-5 hover:border-gray-900 transition-colors bg-white ${
										plan.status ? "opacity-50" : ""
									}`}
								>
									{editingIndex === index ? (
										// Edit Mode
										<div className="space-y-4">
											<div className="space-y-3">
												<div>
													<label className="block text-sm font-medium text-gray-900 mb-1">제목</label>
													<input
														type="text"
														value={editValues?.title || ""}
														onChange={(e) => handleEditChange("title", e.target.value)}
														className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-gray-900"
													/>
												</div>
												<div>
													<label className="block text-sm font-medium text-gray-900 mb-1">설명</label>
													<textarea
														value={editValues?.description || ""}
														onChange={(e) => handleEditChange("description", e.target.value)}
														className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-gray-900"
														rows={2}
													/>
												</div>
												<div className="grid grid-cols-2 gap-3">
													<div>
														<label className="block text-sm font-medium text-gray-900 mb-1">날짜</label>
														<input
															type="text"
															value={editValues?.due_date || ""}
															onChange={(e) => handleEditChange("due_date", e.target.value)}
															placeholder="YYYY-MM-DD"
															className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-gray-900"
														/>
													</div>
													<div>
														<label className="block text-sm font-medium text-gray-900 mb-1">시간</label>
														<input
															type="text"
															value={editValues?.due_time || ""}
															onChange={(e) => handleEditChange("due_time", e.target.value)}
															placeholder="HH:MM"
															className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-gray-900"
														/>
													</div>
												</div>
												<div className="grid grid-cols-2 gap-3">
													<div>
														<label className="block text-sm font-medium text-gray-900 mb-1">장소</label>
														<input
															type="text"
															value={editValues?.location || ""}
															onChange={(e) => handleEditChange("location", e.target.value)}
															className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-gray-900"
														/>
													</div>
													<div>
														<label className="block text-sm font-medium text-gray-900 mb-1">우선순위</label>
														<select
															value={editValues?.priority || ""}
															onChange={(e) => handleEditChange("priority", e.target.value)}
															className="w-full px-3 py-2 border-2 border-gray-300 focus:outline-none focus:border-gray-900"
														>
															<option value="">선택</option>
															<option value="높음">높음</option>
															<option value="중간">중간</option>
															<option value="낮음">낮음</option>
														</select>
													</div>
												</div>
											</div>
											<div className="flex gap-2 justify-end">
												<button
													onClick={handleCancelEdit}
													className="px-4 py-2 bg-white border-2 border-gray-300 text-gray-900 hover:bg-gray-100 transition-colors"
												>
													취소
												</button>
												<button
													onClick={() => handleSaveEdit(index)}
													className="px-4 py-2 bg-gray-900 border-2 border-gray-900 text-white hover:bg-gray-800 transition-colors"
												>
													저장
												</button>
											</div>
										</div>
									) : (
										// View Mode
										<>
											<div className="flex items-start gap-3 mb-3">
												<input
													type="checkbox"
													checked={plan.status}
													onChange={() => handleToggleStatus(index)}
													className="mt-1 w-5 h-5 border-2 border-gray-400 cursor-pointer"
												/>
												<div className="flex-1">
													<div className="flex items-start justify-between mb-2">
														<h4 className={`text-xl font-semibold text-gray-900 flex-1 ${plan.status ? "line-through" : ""}`}>
															{plan.title}
														</h4>
														<div className="flex items-center gap-2">
															{plan.priority && (
																<span className={`px-3 py-1 border-2 text-sm font-medium ${getPriorityColor(plan.priority)}`}>
																	{plan.priority}
																</span>
															)}
															<button
																onClick={() => handleStartEdit(index)}
																className="px-3 py-1 text-sm bg-white border-2 border-gray-300 text-gray-900 hover:bg-gray-100 transition-colors"
															>
																수정
															</button>
															<button
																onClick={() => handleRemove(index)}
																className="px-3 py-1 text-sm bg-white border-2 border-gray-900 text-gray-900 hover:bg-gray-100 transition-colors"
															>
																삭제
															</button>
														</div>
													</div>

													{plan.description && (
														<p className={`text-gray-600 mb-3 leading-relaxed ${plan.status ? "line-through" : ""}`}>
															{plan.description}
														</p>
													)}

													<div className="flex flex-wrap gap-3 text-sm">
														<div className="px-3 py-1.5 border-2 border-gray-300">
															<span className="font-medium text-gray-900">
																날짜: {plan.due_date ? formatDate(plan.due_date) : "미정"}
															</span>
														</div>
														<div className="px-3 py-1.5 border-2 border-gray-300">
															<span className="font-medium text-gray-900">
																시간: {plan.due_time ? formatTime(plan.due_time) : "미정"}
															</span>
														</div>
														<div className="px-3 py-1.5 border-2 border-gray-300">
															<span className="font-medium text-gray-900">장소: {plan.location || "미정"}</span>
														</div>
													</div>
												</div>
											</div>
										</>
									)}
								</div>
							))}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

export default App;
